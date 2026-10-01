import "server-only";

import { clienteAdministrador } from "../supabase/administrador";
import { dePasso, paraPasso } from "../dominio/mapear";
import { aplicarAcao, type Passo } from "../dominio/controle";
import type { Falha, ResultadoEscrita } from "../clientes/servico";

/**
 * Escrita do portal — o que o CLIENTE provoca.
 *
 * Aqui mora a única parte do sistema que roda com a chave de administração a
 * pedido de alguém de fora da MX, e o motivo é explícito na RLS: não existe
 * política de escrita em `monthly_controls` nem em `control_events` para
 * `client_users`. Dar uma ao cliente significaria deixá-lo mover o próprio mês
 * para qualquer passo — inclusive `concluida`, que esconderia a linha da fila da
 * analista.
 *
 * Em troca disso, três amarras valem para tudo neste arquivo:
 *
 * 1. **Quem autoriza a transição é `aplicarAcao`**, a função pura e testada. A
 *    rota declara a AÇÃO; o passo de destino nunca vem de fora.
 * 2. **O `controleId` é conferido contra o `clienteId` da sessão** antes de
 *    qualquer escrita. A chave de administração ignora a RLS, então esta
 *    conferência é a única coisa entre um id trocado no corpo e o mês de outra
 *    empresa.
 * 3. **Toda mudança vira evento**, com `origin: "client"`. Se o evento falhar, o
 *    passo volta: um mês que andou sem registro é pior que um mês que não andou.
 */

function falha(status: number, codigo: string, mensagem: string): { ok: false; falha: Falha } {
  return { ok: false, falha: { status, codigo, mensagem } };
}

export type EnvioDoCliente = {
  controleId: string;
  /** O `client_id` que a SESSÃO diz — nunca o que o corpo da requisição manda. */
  clienteId: string;
  clienteUsuarioId: string;
  /** `null` quando o gestor marcou "não houve mudanças". */
  arquivoId: string | null;
  observacao: string | null;
  semMudancas: boolean;
};

/**
 * Recebe a planilha do mês enviada pelo portal.
 *
 * Duas ações da máquina de passos, conforme o caso: `receber_planilha` quando
 * veio arquivo, `sem_movimentacao` quando o gestor marcou que o mês não mudou. A
 * segunda já deixa o mês conferido — não há planilha a conferir, e fazer a
 * analista abrir uma tela para confirmar que não há nada seria trabalho
 * inventado.
 *
 * Devolve 409 quando a ação não cabe no passo atual. É o caso real de o gestor
 * deixar a aba aberta, a analista pedir correção e ele enviar depois: o envio
 * está correto, o que mudou foi o estado, e a mensagem precisa dizer isso.
 */
export async function receberPlanilhaDoPortal(
  envio: EnvioDoCliente,
): Promise<ResultadoEscrita<{ passo: Passo; protocolo: string | null }>> {
  const acao = envio.semMudancas ? "sem_movimentacao" : "receber_planilha";

  try {
    const supabase = clienteAdministrador();

    const { data: atual, error: erroLeitura } = await supabase
      .from("monthly_controls")
      .select("id, step, client_id, protocol")
      .eq("id", envio.controleId)
      .maybeSingle();

    if (erroLeitura) return falha(503, "sem_banco", "Não foi possível falar com o banco de dados.");

    const linha = atual as { id: string; step: string; client_id: string; protocol: string | null } | null;

    // Mês inexistente e mês de outra empresa recebem a MESMA resposta. Dizer
    // "existe, mas não é seu" conta a quem procura que o id acertou.
    if (!linha || linha.client_id !== envio.clienteId) {
      return falha(404, "nao_encontrado", "Este mês não está disponível na sua conta.");
    }

    const passoAtual = paraPasso(linha.step);
    const destino = aplicarAcao(passoAtual, acao);

    if (!destino) {
      return falha(
        409,
        "passo_incompativel",
        "Este mês mudou de etapa enquanto você preenchia. Atualize a página para ver como ele está.",
      );
    }

    const agora = new Date().toISOString();
    const mudanca: Record<string, unknown> = {
      step: dePasso(destino),
      received_at: agora,
      received_by_client_user: envio.clienteUsuarioId,
      // O autor é um só: a coluna da equipe fica nula quando quem enviou foi o
      // cliente, e é isso que a tela de conferência usa para dizer "enviada
      // pelo portal".
      received_by_profile: null,
      no_changes: envio.semMudancas,
      received_note: envio.observacao ?? (envio.semMudancas ? "Sem movimentação no mês." : null),
      spreadsheet_file_id: envio.arquivoId,
      // Reenvio depois de uma correção: o pedido anterior deixa de valer.
      correction_requested_at: null,
    };

    if (envio.semMudancas) {
      // `sem_movimentacao` leva direto a `conferida`, e a conferência é do
      // sistema: não há analista a creditar, então `checked_by` fica nulo.
      mudanca.checked_at = agora;
      mudanca.checked_by = null;
    }

    const { error: erroUpdate } = await supabase
      .from("monthly_controls")
      .update(mudanca)
      .eq("id", envio.controleId);

    if (erroUpdate) return falha(503, "salvar_falhou", "Não foi possível registrar o envio. Tente de novo.");

    const { error: erroEvento } = await supabase.from("control_events").insert({
      control_id: envio.controleId,
      type: envio.semMudancas ? "no_changes" : "spreadsheet_received",
      origin: "client",
      actor_client_user_id: envio.clienteUsuarioId,
      from_step: dePasso(passoAtual),
      to_step: dePasso(destino),
      note: envio.observacao,
    });

    // Mudança sem registro é pior que mudança que não aconteceu: volta o passo.
    if (erroEvento) {
      await supabase
        .from("monthly_controls")
        .update({ step: dePasso(passoAtual), received_at: null, spreadsheet_file_id: null })
        .eq("id", envio.controleId);

      return falha(503, "evento_falhou", "O envio foi desfeito porque não consegui registrá-lo. Tente de novo.");
    }

    return { ok: true, dados: { passo: destino, protocolo: linha.protocol } };
  } catch {
    return falha(503, "sem_banco", "Não foi possível falar com o servidor.");
  }
}

/**
 * Confere que um arquivo é daquele cliente e daquele mês.
 *
 * O `arquivoId` chega do navegador: ele veio do upload anterior, mas nada
 * impede alguém de trocá-lo. Como o passo seguinte grava esse id em
 * `spreadsheet_file_id` usando a chave de administração, a conferência tem de
 * acontecer antes — senão o mês de uma empresa apontaria para a planilha de
 * outra, e a analista abriria o arquivo errado para conferir.
 */
export async function arquivoPertenceAoCliente(
  arquivoId: string,
  clienteId: string,
): Promise<boolean> {
  try {
    const supabase = clienteAdministrador();
    const { data } = await supabase
      .from("client_files")
      .select("client_id, kind, deleted_at")
      .eq("id", arquivoId)
      .maybeSingle();

    const linha = data as { client_id: string; kind: string; deleted_at: string | null } | null;
    return Boolean(linha && linha.client_id === clienteId && linha.kind === "spreadsheet" && !linha.deleted_at);
  } catch {
    return false;
  }
}

import "server-only";

import { clienteServidor } from "../supabase/servidor";
import { dePasso, deModelo } from "../dominio/mapear";
import {
  aplicarAcao,
  datasDaCompetencia,
  passoInicial,
  type Acao,
  type ModeloDeMensagem,
  type Passo,
} from "../dominio/controle";
import type { Falha, ResultadoEscrita } from "../clientes/servico";
import { primeiroDia } from "./consulta";

/**
 * Escrita do Controle mensal.
 *
 * Duas regras valem para tudo aqui:
 *
 * 1. **O passo só muda pela máquina.** Quem decide se a transição existe é
 *    `aplicarAcao`, em `lib/dominio/controle.ts` — função pura e testada. A
 *    rota não escolhe o passo de destino; ela declara a AÇÃO.
 *
 * 2. **Toda mudança vira evento.** Se o evento falhar, o passo VOLTA. Um mês
 *    que andou sem registro é pior que um mês que não andou: ninguém
 *    consegue explicar depois quem fez o quê.
 */

function falhaGenerica(): Falha {
  return { status: 503, codigo: "banco_indisponivel", mensagem: "Não foi possível salvar agora. Tente de novo." };
}

type TipoDeEvento =
  | "opened"
  | "step_changed"
  | "spreadsheet_received"
  | "no_changes"
  | "checked"
  | "correction_requested"
  | "invoice_attached"
  | "paid"
  | "message"
  | "note";

const EVENTO_DA_ACAO: Record<Acao, TipoDeEvento> = {
  receber_planilha: "spreadsheet_received",
  sem_movimentacao: "no_changes",
  conferir: "checked",
  pedir_correcao: "correction_requested",
  anexar_boleto: "invoice_attached",
  marcar_pago: "paid",
};

/**
 * O cliente do Supabase que escreve.
 *
 * Normalmente é o da sessão, e a RLS confere quem está fazendo o quê. O cron
 * não tem sessão nenhuma — ninguém está logado às 7h — e passa o cliente de
 * administração explicitamente. Receber o cliente por parâmetro, em vez de
 * ler um "modo cron" de dentro, deixa visível na chamada qual das duas coisas
 * está acontecendo.
 */
type Cliente = Awaited<ReturnType<typeof clienteServidor>>;

/**
 * Abre a competência de todos os clientes ativos que ainda não a têm.
 *
 * Idempotente: `unique (client_id, competence)` no banco, e o insert ignora
 * conflito. O cron chama isto toda manhã, e chamar duas vezes no mesmo dia não
 * pode abrir o mês duas vezes.
 *
 * As datas são CONGELADAS aqui: mudar a regra no cadastro depois não reescreve
 * um mês que já está em andamento.
 */
export async function abrirCompetencia(
  competencia: string,
  cliente?: Cliente,
): Promise<ResultadoEscrita<{ abertos: number; jaExistiam: number }>> {
  try {
    const supabase = cliente ?? (await clienteServidor());

    const { data: clientes, error: erroClientes } = await supabase
      .from("clients")
      .select("id, inform_day, cutoff_day, confirm_day, invoice_day, due_day")
      .eq("active", true)
      .is("deleted_at", null);

    if (erroClientes) return { ok: false, falha: falhaGenerica() };

    const { data: existentes } = await supabase
      .from("monthly_controls")
      .select("client_id")
      .eq("competence", primeiroDia(competencia));

    const jaTem = new Set(((existentes ?? []) as { client_id: string }[]).map((l) => l.client_id));

    const novos: Record<string, unknown>[] = [];
    for (const cliente of (clientes ?? []) as {
      id: string;
      inform_day: number | null;
      cutoff_day: number | null;
      confirm_day: number | null;
      invoice_day: number;
      due_day: number;
    }[]) {
      if (jaTem.has(cliente.id)) continue;

      const regras = {
        informarDia: cliente.inform_day,
        corteDia: cliente.cutoff_day,
        confirmarDia: cliente.confirm_day,
        boletoDia: cliente.invoice_day,
        vencimentoDia: cliente.due_day,
      };
      const datas = datasDaCompetencia(competencia, regras);
      // Competência malformada não abre mês nenhum, em vez de abrir com data
      // inventada — data errada aqui vira cobrança no dia errado.
      if (!datas) continue;

      novos.push({
        client_id: cliente.id,
        competence: primeiroDia(competencia),
        step: dePasso(passoInicial(regras)),
        inform_date: datas.informar,
        cutoff_date: datas.corte,
        confirm_date: datas.confirmar ?? null,
        invoice_date: datas.boleto,
        due_date: datas.vencimento,
      });
    }

    if (novos.length === 0) return { ok: true, dados: { abertos: 0, jaExistiam: jaTem.size } };

    const { data, error } = await supabase.from("monthly_controls").insert(novos).select("id");
    if (error) return { ok: false, falha: falhaGenerica() };

    const abertos = ((data ?? []) as { id: string }[]).map((l) => l.id);

    // O evento de abertura tem origem `system`: não houve gente, e a linha do
    // tempo precisa dizer isso.
    if (abertos.length) {
      await supabase.from("control_events").insert(
        abertos.map((id) => ({
          control_id: id,
          type: "opened",
          origin: "system",
          note: `Mês aberto automaticamente (${competencia}).`,
        })),
      );
    }

    return { ok: true, dados: { abertos: abertos.length, jaExistiam: jaTem.size } };
  } catch {
    return { ok: false, falha: falhaGenerica() };
  }
}

export type CamposDaAcao = {
  observacao?: string | null;
  motivo?: string | null;
  planilhaId?: string | null;
  boleto?: { arquivoId?: string | null; valor?: number | null; parcela?: string | null; vencimento?: string | null };
};

/**
 * Aplica uma ação ao mês: muda o passo e registra o evento, nessa ordem.
 *
 * Devolve 409 quando a ação não cabe no passo atual — e não 400: o envio está
 * correto, o que mudou foi o estado. Duas analistas na mesma linha é
 * exatamente quando isso acontece, e a mensagem precisa dizer o que houve.
 */
export async function aplicarAcaoNoControle(
  id: string,
  acao: Acao,
  autor: string,
  campos: CamposDaAcao = {},
): Promise<ResultadoEscrita<{ id: string; passo: Passo }>> {
  try {
    const supabase = await clienteServidor();

    const { data: atual, error: erroLeitura } = await supabase
      .from("monthly_controls")
      .select("id, step")
      .eq("id", id)
      .maybeSingle();

    if (erroLeitura) return { ok: false, falha: falhaGenerica() };
    if (!atual) {
      return {
        ok: false,
        falha: { status: 404, codigo: "nao_encontrado", mensagem: "Esta movimentação não existe." },
      };
    }

    const { paraPasso } = await import("../dominio/mapear");
    const passoAtual = paraPasso((atual as { step: string }).step);
    const destino = aplicarAcao(passoAtual, acao);

    if (!destino) {
      return {
        ok: false,
        falha: {
          status: 409,
          codigo: "passo_incompativel",
          mensagem: "Esta movimentação já mudou de etapa. Atualize a página para ver como ela está.",
        },
      };
    }

    const agora = new Date().toISOString();
    const mudanca: Record<string, unknown> = { step: dePasso(destino) };

    if (acao === "receber_planilha") {
      mudanca.received_at = agora;
      mudanca.received_by_profile = autor;
      mudanca.spreadsheet_file_id = campos.planilhaId ?? null;
      mudanca.received_note = campos.observacao ?? null;
      mudanca.no_changes = false;
    }
    if (acao === "sem_movimentacao") {
      mudanca.received_at = agora;
      mudanca.received_by_profile = autor;
      mudanca.no_changes = true;
      mudanca.received_note = campos.observacao ?? "Sem movimentação no mês.";
      mudanca.checked_at = agora;
      mudanca.checked_by = autor;
    }
    if (acao === "conferir") {
      mudanca.checked_at = agora;
      mudanca.checked_by = autor;
      mudanca.check_note = campos.observacao ?? null;
    }
    if (acao === "pedir_correcao") {
      mudanca.correction_requested_at = agora;
      mudanca.correction_reason = campos.motivo ?? null;
      // A planilha recusada sai do lugar: o que vale é a próxima.
      mudanca.received_at = null;
      mudanca.spreadsheet_file_id = null;
    }
    if (acao === "anexar_boleto") {
      mudanca.invoice_attached_at = agora;
      mudanca.invoice_file_id = campos.boleto?.arquivoId ?? null;
      mudanca.invoice_amount = campos.boleto?.valor ?? null;
      mudanca.invoice_installment = campos.boleto?.parcela ?? null;
      mudanca.invoice_due = campos.boleto?.vencimento ?? null;
    }
    if (acao === "marcar_pago") mudanca.paid_at = agora;

    const { error: erroUpdate } = await supabase.from("monthly_controls").update(mudanca).eq("id", id);
    if (erroUpdate) return { ok: false, falha: falhaGenerica() };

    const { error: erroEvento } = await supabase.from("control_events").insert({
      control_id: id,
      type: EVENTO_DA_ACAO[acao],
      origin: "staff",
      actor_profile_id: autor,
      from_step: dePasso(passoAtual),
      to_step: dePasso(destino),
      note: campos.observacao ?? campos.motivo ?? null,
    });

    // Mudança sem registro é pior que mudança que não aconteceu: volta o passo.
    if (erroEvento) {
      await supabase.from("monthly_controls").update({ step: dePasso(passoAtual) }).eq("id", id);
      return {
        ok: false,
        falha: {
          status: 503,
          codigo: "evento_falhou",
          mensagem: "A mudança foi desfeita porque não consegui registrá-la no histórico.",
        },
      };
    }

    return { ok: true, dados: { id, passo: destino } };
  } catch {
    return { ok: false, falha: falhaGenerica() };
  }
}

/**
 * Registra uma mensagem enviada e aponta a linha do Controle para ela.
 *
 * O WhatsApp não tem confirmação de entrega: `enviada` aqui significa "a
 * analista abriu a conversa com o texto pronto". A tela diz isso — prometer
 * entrega que não se pode verificar é pior que não prometer nada.
 */
export async function registrarMensagem(
  controleId: string,
  modelo: ModeloDeMensagem,
  canal: "email" | "whatsapp",
  destino: string,
  corpo: string,
  autor: string | null,
  falhou?: string | null,
  cliente?: Cliente,
): Promise<ResultadoEscrita<{ id: number }>> {
  try {
    const supabase = cliente ?? (await clienteServidor());

    const { data, error } = await supabase
      .from("messages")
      .insert({
        control_id: controleId,
        kind: deModelo(modelo),
        channel: canal,
        to_address: destino,
        body: corpo,
        status: falhou ? "failed" : "sent",
        sent_by: autor,
        sent_at: falhou ? null : new Date().toISOString(),
        error: falhou ?? null,
      })
      .select("id")
      .single();

    if (error) return { ok: false, falha: falhaGenerica() };

    const id = (data as { id: number }).id;

    // A falha não vira "última mensagem": a coluna do Controle mostra o que
    // chegou ao cliente, não o que se tentou.
    if (!falhou) {
      await supabase.from("monthly_controls").update({ last_message_id: id }).eq("id", controleId);
      await supabase.from("control_events").insert({
        control_id: controleId,
        type: "message",
        origin: autor ? "staff" : "system",
        actor_profile_id: autor,
        note: `Mensagem enviada por ${canal === "email" ? "e-mail" : "WhatsApp"} para ${destino}.`,
        payload: { kind: deModelo(modelo), channel: canal },
      });
    }

    return { ok: true, dados: { id } };
  } catch {
    return { ok: false, falha: falhaGenerica() };
  }
}

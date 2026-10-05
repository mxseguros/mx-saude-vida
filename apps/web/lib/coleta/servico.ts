import "server-only";

import { aplicarAcao, type Passo } from "../dominio/controle";
import { movimentosDaColeta, type DadosDaColeta, type QuemDigitou } from "../dominio/coleta";
import { deQuemDigitou, deTipoDeMovimento, dePasso, paraPasso } from "../dominio/mapear";
import { hojeSaoPaulo } from "../dominio/hoje";
import { registrarLog } from "../log";
import { clienteAdministrador } from "../supabase/administrador";
import { mesDoToken } from "./consulta";

/**
 * O que a rota pública ESCREVE.
 *
 * Grava com a chave de administração, depois de o token ser conferido. O
 * desenho é o mesmo do envio pelo portal que saiu em 05/10, e pelo mesmo
 * motivo: o token prova que a pessoa recebeu o link, não QUEM ela é, e isso
 * não dá para perguntar em SQL — então a RLS não tem como decidir, e quem
 * decide é esta função.
 *
 * O que ela nunca aceita de fora: o cliente, o mês, o passo e quem digitou.
 * Os três primeiros vêm do token; o quarto é sempre `gestor`. Aceitar qualquer
 * um deles do corpo do POST seria deixar quem tem um link escrever no mês de
 * outro cliente.
 */

export type Recusa = { status: number; codigo: string; mensagem: string };

export type ColetaRegistrada = {
  /** `MOV-000123`: o numero que o banco gerou quando o mes abriu. */
  protocolo: string;
  /** `true` quando ele já havia enviado: a tela fala diferente, e a MX é avisada. */
  correcao: boolean;
};

const RECUSA_EXPIRADO: Recusa = {
  status: 410,
  codigo: "link_expirado",
  mensagem: "Este link fechou. Fale com a MX para receber um novo.",
};

const RECUSA_INVALIDO: Recusa = {
  status: 404,
  codigo: "link_invalido",
  mensagem: "Este link não é válido. Confira o endereço ou fale com a MX.",
};

const RECUSA_BANCO: Recusa = {
  status: 503,
  codigo: "banco_indisponivel",
  mensagem: "Não foi possível enviar agora. O que você preencheu continua aqui — tente de novo.",
};

/**
 * Registra o que o gestor informou.
 *
 * REFAZ, não acumula: as linhas que o gestor tinha mandado antes saem e as
 * novas entram. Acumular faria o segundo envio dobrar a movimentação do mês, e
 * a analista não teria como saber qual metade vale. O que ele mandou antes não
 * se perde — a linha do tempo é append-only, e cada envio deixa um evento com
 * as contagens.
 *
 * Só as linhas de `manager`. O que a analista digitou à mão fica: ela digitou
 * porque sabia algo que o formulário não trouxe, e um reenvio do gestor não
 * pode apagar o trabalho dela.
 */
export async function registrarColeta(
  token: string,
  dados: DadosDaColeta,
  hoje: string = hojeSaoPaulo(),
): Promise<{ ok: true; dados: ColetaRegistrada } | { ok: false; falha: Recusa }> {
  const mes = await mesDoToken(token, hoje);
  if (!mes.ok) {
    return { ok: false, falha: mes.estado === "expirado" ? RECUSA_EXPIRADO : RECUSA_INVALIDO };
  }

  return gravarColeta(mes.controleId, dados, { tipo: "gestor" });
}

/**
 * A MESMA coleta, digitada pela analista.
 *
 * Existe porque acontece: o gestor manda a movimentação por e-mail, por áudio
 * no WhatsApp, ou dita por telefone. Sem este caminho a analista teria de
 * abrir o link do cliente e se passar por ele — e aí a MX perderia a única
 * coisa que a Fase 5 precisa saber para conferir: **quem** disse o quê.
 *
 * Por isso `staff`. A conferência cruza com a planilha o que o GESTOR informou;
 * o que a analista digitou ela já sabe de onde veio.
 */
export async function registrarColetaPelaEquipe(
  controleId: string,
  dados: DadosDaColeta,
  perfilId: string,
): Promise<{ ok: true; dados: ColetaRegistrada } | { ok: false; falha: Recusa }> {
  try {
    const supabase = clienteAdministrador();
    const { data, error } = await supabase
      .from("monthly_controls")
      .select("id")
      .eq("id", controleId)
      .maybeSingle();

    if (error) return { ok: false, falha: RECUSA_BANCO };
    if (!data) {
      return {
        ok: false,
        falha: { status: 404, codigo: "nao_encontrado", mensagem: "Esta movimentação não existe." },
      };
    }

    return gravarColeta(controleId, dados, { tipo: "equipe", perfilId });
  } catch {
    return { ok: false, falha: RECUSA_BANCO };
  }
}

/** Quem digitou, e o que isso muda na gravação. */
type Quem = { tipo: "gestor" } | { tipo: "equipe"; perfilId: string };

/**
 * A gravação, uma só para os dois caminhos.
 *
 * Grava com a chave de administração nos DOIS casos. No caminho do gestor
 * porque não há sessão. No da analista porque a mesma função serve aos dois, e
 * `exigirEscrita` já barrou o perfil de leitura na rota — a RLS faria a mesma
 * pergunta, e fazer duas funções só para trocar o cliente do Supabase seria
 * duplicar a regra para não duplicar uma linha.
 */
async function gravarColeta(
  controleId: string,
  dados: DadosDaColeta,
  quem: Quem,
): Promise<{ ok: true; dados: ColetaRegistrada } | { ok: false; falha: Recusa }> {
  const porQuem = quem.tipo === "gestor" ? "gestor" : "equipe";
  const fonte = deQuemDigitou(porQuem);

  try {
    const supabase = clienteAdministrador();

    const { data: atual, error: erroPasso } = await supabase
      .from("monthly_controls")
      .select("step, checked_at, received_at, protocol")
      .eq("id", controleId)
      .single();

    if (erroPasso || !atual) return { ok: false, falha: RECUSA_BANCO };

    const linha = atual as {
      step: string;
      checked_at: string | null;
      received_at: string | null;
      protocol: string | null;
    };
    const passoAtual = paraPasso(linha.step);

    // Quantas linhas havia, para o evento contar o que mudou.
    const { count: antes } = await supabase
      .from("movements")
      .select("id", { count: "exact", head: true })
      .eq("control_id", controleId)
      .eq("source", fonte);

    // Refaz SÓ as linhas de quem está gravando agora. Um reenvio do gestor não
    // apaga o que a analista digitou à mão: ela digitou porque sabia algo que o
    // formulário não trouxe.
    const { error: erroApagar } = await supabase
      .from("movements")
      .delete()
      .eq("control_id", controleId)
      .eq("source", fonte);

    if (erroApagar) return { ok: false, falha: RECUSA_BANCO };

    const movimentos = movimentosDaColeta(dados, porQuem);
    if (movimentos.length) {
      const { error: erroInserir } = await supabase.from("movements").insert(
        movimentos.map((m) => ({
          control_id: controleId,
          kind: deTipoDeMovimento(m.tipo),
          full_name: m.nome,
          document: m.documento,
          source: deQuemDigitou(m.porQuem),
        })),
      );
      if (erroInserir) return { ok: false, falha: RECUSA_BANCO };
    }

    const agora = new Date().toISOString();
    const acao = dados.semMovimentacao ? "sem_movimentacao" : "receber_planilha";
    const destino = aplicarAcao(passoAtual, acao);

    const mudanca: Record<string, unknown> = {
      received_at: agora,
      /**
       * Quem da MX recebeu. Nulo quando veio pelo link: o gestor não tem conta,
       * e quem informou se lê em `manager_name`.
       *
       * Quando a analista digita, ela assina — é o que diferencia depois "o
       * gestor informou" de "alguém da MX anotou o que ouviu no telefone".
       */
      received_by_profile: quem.tipo === "equipe" ? quem.perfilId : null,
      no_changes: dados.semMovimentacao,
      received_note: dados.observacao ?? (dados.semMovimentacao ? "Ninguém entrou nem saiu no mês." : null),
      spreadsheet_file_id: dados.planilhaId,
      manager_name: dados.nome,
      manager_phone: dados.celular,
      manager_sector: dados.setor,
    };

    /**
     * O passo só anda quando a máquina permite.
     *
     * Decisão #3 do Gabriel: o gestor pode corrigir depois de enviar, e a MX
     * recebe um alerta. Então um reenvio num mês já conferido NÃO volta o passo
     * — voltar faria o mês perder a conferência da analista por uma correção de
     * uma letra no nome, e o Controle pediria o trabalho de novo. O passo fica,
     * o dado novo entra, e o alerta é o que chama a analista para olhar.
     */
    const correcao = linha.received_at !== null;
    if (destino && !correcao) mudanca.step = dePasso(destino);
    if (dados.semMovimentacao && destino === "conferida" && !correcao) {
      // "Ninguém entrou nem saiu" não tem planilha a conferir: o próprio
      // atalho é a conferência, e é o que a máquina já diz ao levar a
      // `conferida`. O carimbo registra que não houve gente da MX nisso.
      mudanca.checked_at = agora;
      mudanca.checked_by = quem.tipo === "equipe" ? quem.perfilId : null;
      mudanca.check_note =
        quem.tipo === "equipe"
          ? "Sem movimentação no mês, conforme o gestor informou."
          : "Conferência automática: o gestor informou que não houve movimentação.";
    }

    const { error: erroUpdate } = await supabase
      .from("monthly_controls")
      .update(mudanca)
      .eq("id", controleId);

    if (erroUpdate) return { ok: false, falha: RECUSA_BANCO };

    const nota = notaDoEvento(dados, antes ?? 0, correcao, linha.checked_at, porQuem);

    const { error: erroEvento } = await supabase.from("control_events").insert({
      control_id: controleId,
      type: dados.semMovimentacao ? "no_changes" : "spreadsheet_received",
      /**
       * `client` quando veio pelo link, `staff` quando a analista digitou.
       *
       * É o selo da linha do tempo, e é o que separa "o gestor informou" de "a
       * MX anotou". A pergunta aparece de verdade seis meses depois, quando
       * alguém quer saber de onde saiu um CPF.
       */
      origin: quem.tipo === "gestor" ? "client" : "staff",
      actor_profile_id: quem.tipo === "equipe" ? quem.perfilId : null,
      from_step: dePasso(passoAtual),
      to_step: dePasso((destino && !correcao ? destino : passoAtual) as Passo),
      note: nota,
      payload: { entradas: dados.entradas.length, saidas: dados.saidas.length, correcao },
    });

    // Aqui NÃO desfaço, e é a única exceção no sistema. Em todo o resto,
    // mudança sem registro volta atrás; neste caminho, desfazer significaria
    // descartar o que acabou de ser digitado no celular — e o gestor não tem
    // conta, não tem rascunho e talvez não volte. O dado fica, e a falha vira
    // log para a MX conferir.
    if (erroEvento) registrarLog("erro", "coleta.evento", { codigo: erroEvento.code });

    registrarLog("info", "coleta.recebida", {
      entradas: dados.entradas.length,
      saidas: dados.saidas.length,
      semMovimentacao: dados.semMovimentacao,
      comPlanilha: dados.planilhaId !== null,
      correcao,
    });

    return {
      ok: true,
      dados: { protocolo: linha.protocol ?? "", correcao },
    };
  } catch {
    return { ok: false, falha: RECUSA_BANCO };
  }
}

/**
 * A nota da linha do tempo: o que a analista lê sem abrir nada.
 *
 * Sem nome e sem CPF. A linha do tempo aparece na tela e sai no log, e uma nota
 * com "entrou Maria da Silva, CPF 123" espalharia dado pessoal por dois lugares
 * que não têm retenção.
 */
function notaDoEvento(
  dados: DadosDaColeta,
  antes: number,
  correcao: boolean,
  conferidoEm: string | null,
  porQuem: QuemDigitou,
): string {
  // "O gestor" quando ele mesmo preencheu o link; "A MX" quando a analista
  // digitou o que ele mandou por fora. A frase é o que a analista lê meses
  // depois, e as duas situações pedem conferências diferentes.
  const autor = porQuem === "gestor" ? "O gestor" : "A MX";

  if (dados.semMovimentacao) {
    return correcao
      ? `${autor} corrigiu: agora consta que NÃO houve movimentação no mês.`
      : porQuem === "gestor"
        ? "O gestor informou que ninguém entrou nem saiu no mês."
        : "A MX registrou que não houve movimentação, conforme o gestor informou.";
  }

  const partes = [`${dados.entradas.length} entrada(s)`, `${dados.saidas.length} saída(s)`];
  if (dados.planilhaId) partes.push("planilha anexada");

  if (!correcao) return `${autor} informou ${partes.join(", ")}.`;

  const aviso = conferidoEm
    ? "ATENÇÃO: o mês já havia sido conferido. Confira de novo o que mudou."
    : "O envio anterior foi substituído.";
  return `${autor} REENVIOU: ${partes.join(", ")} (antes eram ${antes} pessoa(s)). ${aviso}`;
}

/**
 * Marca que o gestor abriu o link.
 *
 * Só a PRIMEIRA vez: a coluna responde "ele viu?", e sobrescrever a cada
 * recarga trocaria essa resposta pela hora da última visita — que não é a
 * pergunta que a analista faz quando o prazo está perto.
 *
 * Falha em silêncio de propósito. É um carimbo de conveniência, e derrubar a
 * página do gestor porque um `update` não passou seria trocar a coleta do mês
 * por um dado de telemetria.
 */
export async function marcarLinkAberto(token: string): Promise<void> {
  try {
    const supabase = clienteAdministrador();
    await supabase
      .from("monthly_controls")
      .update({ collection_opened_at: new Date().toISOString() })
      .eq("collection_token", token)
      .is("collection_opened_at", null);
  } catch {
    // Sem log: a falha não diz nada que a MX precise saber, e esta função roda
    // em toda abertura de link.
  }
}

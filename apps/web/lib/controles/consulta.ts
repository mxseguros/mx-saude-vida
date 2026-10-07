import "server-only";

import { clienteServidor } from "../supabase/servidor";
import { paraCanal, paraModelo, paraPasso } from "../dominio/mapear";
import { competenciaDe, type DatasDoMes, type ModeloDeMensagem, type Passo } from "../dominio/controle";
import type { Canal } from "../dominio/mensagem";
import type { Produto } from "../dominio/cliente";
import type { Resultado } from "../clientes/consulta";

/**
 * Leitura do Controle mensal.
 *
 * Uma linha por cliente por competência, lida da view `v_control_board` — que
 * já junta cliente, seguradora, analista e a última mensagem. A view é
 * `security_invoker`, então a RLS continua valendo: a equipe vê tudo, o
 * cliente do portal veria só o dele.
 */

export type LinhaDoControle = {
  id: string;
  clienteId: string;
  competencia: string;
  passo: Passo;
  datas: DatasDoMes;
  protocolo: string | null;

  razaoSocial: string;
  nomeFantasia: string | null;
  documento: string;
  produto: Produto;
  seguradora: string | null;
  observacoes: string | null;

  canal: Canal;
  gestorNome: string | null;
  gestorCelular: string | null;
  gestorEmail: string | null;

  analista: string | null;
  semMudancas: boolean;
  recebidaEm: string | null;
  conferidaEm: string | null;
  valorDoBoleto: number | null;
  vencimentoDoBoleto: string | null;
  parcelaDoBoleto: string | null;
  boletoArquivoId: string | null;
  pagaEm: string | null;

  ultimaMensagem: { modelo: ModeloDeMensagem; canal: "email" | "whatsapp"; em: string } | null;

  /** Quando a analista confirmou a emissão. Nulo = ainda não, ou o cliente não tem a etapa. */
  emissaoConfirmadaEm: string | null;

  /** O cliente faz a própria movimentação: só boleto e pagamento. */
  movimentacaoPropria: boolean;

  /** A coleta por link deste mês. */
  coleta: Coleta;
};

export type Coleta = {
  /**
   * Se existe link gerado. O TOKEN não vem aqui, de propósito.
   *
   * A analista pode lê-lo — a RLS da tabela permite —, mas esta consulta
   * desenha 177 linhas no Controle, e pôr em cada linha a credencial de acesso
   * às vidas de uma empresa faria o token de todos os clientes viajar até o
   * navegador a cada abertura da tela. Quem precisa do token é a tela da
   * coleta, e ela busca o do seu mês.
   */
  temLink: boolean;
  /** O dia, inclusive, até o qual o link abre. */
  valeAte: string | null;
  /** Quando o gestor abriu o link pela primeira vez. */
  abertoEm: string | null;

  /**
   * Quem informou NESTE mês, que pode não ser o contato do cadastro: quem
   * informa muda de um mês para o outro. As duas respostas interessam — a do
   * cadastro para saber a quem mandar, esta para saber quem respondeu.
   */
  gestorDoMes: { nome: string | null; celular: string | null; setor: string | null };

  /** Separados porque a conferência trata diferente. */
  entradasDoGestor: number;
  saidasDoGestor: number;
  entradasDaEquipe: number;
  saidasDaEquipe: number;

  /**
   * O gestor reenviou DEPOIS de a analista conferir.
   *
   * É o alerta da decisão de 05/10: ele pode corrigir, e a MX tem de saber —
   * senão a fatura vai com o número que ela conferiu e a movimentação que
   * entrou é outra.
   */
  reenviouDepoisDeConferir: boolean;
};

type LinhaDaView = {
  id: string;
  client_id: string;
  competence: string;
  step: string;
  inform_date: string | null;
  cutoff_date: string | null;
  invoice_date: string;
  due_date: string;
  protocol: string | null;
  no_changes: boolean;
  received_at: string | null;
  checked_at: string | null;
  invoice_amount: string | number | null;
  invoice_due: string | null;
  invoice_installment: string | null;
  invoice_file_id: string | null;
  paid_at: string | null;
  legal_name: string;
  trade_name: string | null;
  document: string;
  product: Produto;
  channel: string;
  manager_name: string | null;
  manager_phone: string | null;
  manager_email: string | null;
  notes: string | null;
  insurer_name: string | null;
  analyst_name: string | null;
  last_message_kind: string | null;
  last_message_channel: string | null;
  last_message_at: string | null;
  has_collection_link: boolean | null;
  collection_expires_at: string | null;
  collection_opened_at: string | null;
  month_manager_name: string | null;
  month_manager_phone: string | null;
  month_manager_sector: string | null;
  manager_entries: number | null;
  manager_exits: number | null;
  staff_entries: number | null;
  staff_exits: number | null;
  resent_after_check: boolean | null;
  confirm_date: string | null;
  issue_confirmed_at: string | null;
  self_managed: boolean | null;
};

function paraLinha(v: LinhaDaView): LinhaDoControle {
  return {
    id: v.id,
    clienteId: v.client_id,
    // A competência é o dia 1 no banco; aqui basta o mês.
    competencia: competenciaDe(v.competence),
    passo: paraPasso(v.step),
    datas: {
      informar: v.inform_date,
      corte: v.cutoff_date,
      ...(v.confirm_date ? { confirmar: v.confirm_date } : {}),
      boleto: v.invoice_date,
      vencimento: v.due_date,
    },
    protocolo: v.protocol,
    razaoSocial: v.legal_name,
    nomeFantasia: v.trade_name,
    documento: v.document,
    produto: v.product,
    seguradora: v.insurer_name,
    observacoes: v.notes,
    canal: paraCanal(v.channel),
    gestorNome: v.manager_name,
    gestorCelular: v.manager_phone,
    gestorEmail: v.manager_email,
    analista: v.analyst_name,
    semMudancas: v.no_changes,
    recebidaEm: v.received_at,
    conferidaEm: v.checked_at,
    valorDoBoleto: v.invoice_amount === null ? null : Number(v.invoice_amount),
    vencimentoDoBoleto: v.invoice_due,
    parcelaDoBoleto: v.invoice_installment,
    boletoArquivoId: v.invoice_file_id,
    pagaEm: v.paid_at,
    ultimaMensagem:
      v.last_message_kind && v.last_message_at
        ? {
            modelo: paraModelo(v.last_message_kind),
            canal: v.last_message_channel === "email" ? "email" : "whatsapp",
            em: v.last_message_at,
          }
        : null,
    emissaoConfirmadaEm: v.issue_confirmed_at,
    movimentacaoPropria: v.self_managed === true,
    coleta: {
      temLink: v.has_collection_link === true,
      // O banco guarda o instante; a decisão de prazo é por DIA, e é assim que
      // o domínio compara (`estadoDoLink`).
      valeAte: v.collection_expires_at ? v.collection_expires_at.slice(0, 10) : null,
      abertoEm: v.collection_opened_at,
      gestorDoMes: {
        nome: v.month_manager_name,
        celular: v.month_manager_phone,
        setor: v.month_manager_sector,
      },
      entradasDoGestor: Number(v.manager_entries ?? 0),
      saidasDoGestor: Number(v.manager_exits ?? 0),
      entradasDaEquipe: Number(v.staff_entries ?? 0),
      saidasDaEquipe: Number(v.staff_exits ?? 0),
      reenviouDepoisDeConferir: v.resent_after_check === true,
    },
  };
}

/** A competência é guardada como o dia 1 do mês: `2026-09` vira `2026-09-01`. */
export function primeiroDia(competencia: string): string {
  return `${competencia}-01`;
}

export async function listarControles(competencia: string): Promise<Resultado<LinhaDoControle[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("v_control_board")
      .select("*")
      .eq("competence", primeiroDia(competencia))
      // Quem tem prazo mais curto primeiro. O desempate é o nome, para a
      // ordem não dançar entre um carregamento e outro.
      .order("inform_date", { ascending: true, nullsFirst: false })
      .order("legal_name");

    if (error) return { dados: [], erro: "Não foi possível carregar o Controle agora." };
    return { dados: ((data ?? []) as unknown as LinhaDaView[]).map(paraLinha), erro: null };
  } catch {
    return { dados: [], erro: "Não foi possível falar com o banco de dados." };
  }
}

export async function lerControle(id: string): Promise<Resultado<LinhaDoControle | null>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.from("v_control_board").select("*").eq("id", id).maybeSingle();

    if (error) return { dados: null, erro: "Não foi possível carregar a movimentação." };
    if (!data) return { dados: null, erro: null };
    return { dados: paraLinha(data as unknown as LinhaDaView), erro: null };
  } catch {
    return { dados: null, erro: "Não foi possível falar com o banco de dados." };
  }
}

/** As competências que já têm linha, da mais nova para a mais antiga. */
export async function listarCompetencias(): Promise<Resultado<string[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("monthly_controls")
      .select("competence")
      .order("competence", { ascending: false })
      .limit(500);

    if (error) return { dados: [], erro: null };
    const meses = [...new Set(((data ?? []) as { competence: string }[]).map((l) => competenciaDe(l.competence)))];
    return { dados: meses, erro: null };
  } catch {
    return { dados: [], erro: null };
  }
}

export type ModeloSalvo = {
  modelo: ModeloDeMensagem;
  canalPadrao: Canal;
  assunto: string;
  corpo: string;
};

export async function listarModelos(): Promise<Resultado<ModeloSalvo[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("message_templates")
      .select("kind, default_channel, subject, body");

    if (error) return { dados: [], erro: "Não foi possível carregar os modelos de mensagem." };

    const linhas = (data ?? []) as { kind: string; default_channel: string; subject: string; body: string }[];
    return {
      dados: linhas.map((l) => ({
        modelo: paraModelo(l.kind),
        canalPadrao: paraCanal(l.default_channel),
        assunto: l.subject,
        corpo: l.body,
      })),
      erro: null,
    };
  } catch {
    return { dados: [], erro: "Não foi possível carregar os modelos de mensagem." };
  }
}

/**
 * A planilha que o cliente enviou neste mês.
 *
 * Devolve a ficha do arquivo, não o conteúdo: quem abre o xlsx é a tela de
 * conferir, pela rota de prévia. Separado porque `v_control_board` não leva o
 * nome do arquivo e juntar mais uma relação ali custaria em toda listagem do
 * Controle.
 */
export type PlanilhaDoMes = {
  id: string;
  nome: string;
  tamanho: number | null;
  enviadaEm: string;
  /** Quem da MX anexou. `null` quando veio pelo link de coleta. */
  porQuem: string | null;
  pelaMX: boolean;
};

export async function lerPlanilhaDoMes(controleId: string): Promise<Resultado<PlanilhaDoMes | null>> {
  try {
    const supabase = await clienteServidor();

    const { data, error } = await supabase
      .from("client_files")
      .select(
        "id, original_name, size_bytes, created_at, uploaded_by_profile, profiles:uploaded_by_profile(full_name)",
      )
      .eq("control_id", controleId)
      .eq("kind", "spreadsheet")
      .is("deleted_at", null)
      // A última vence: depois de uma correção o cliente reenvia, e a antiga
      // fica no acervo mas não é a que se confere.
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return { dados: null, erro: "Não foi possível carregar a planilha." };
    if (!data) return { dados: null, erro: null };

    const linha = data as unknown as {
      id: string;
      original_name: string;
      size_bytes: number | null;
      created_at: string;
      uploaded_by_profile: string | null;
      profiles: { full_name: string } | { full_name: string }[] | null;
    };

    const um = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
    const daEquipe = um(linha.profiles);

    return {
      dados: {
        id: linha.id,
        nome: linha.original_name,
        tamanho: linha.size_bytes,
        enviadaEm: linha.created_at,
        porQuem: daEquipe?.full_name ?? null,
        pelaMX: linha.uploaded_by_profile !== null,
      },
      erro: null,
    };
  } catch {
    return { dados: null, erro: "Não foi possível falar com o banco de dados." };
  }
}

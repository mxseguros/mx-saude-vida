import "server-only";

import { clienteServidor } from "../supabase/servidor";
import { paraPasso } from "../dominio/mapear";
import { competenciaDe, type DatasDoMes, type Passo } from "../dominio/controle";
import type { TipoDeArquivo } from "../dominio/arquivo";
import type { Resultado } from "../clientes/consulta";

/**
 * Leitura do portal.
 *
 * Toda consulta aqui usa o cliente da SESSÃO, nunca a chave de administração: é
 * a RLS que garante que o gestor da empresa A não alcance a empresa B, e passar
 * por cima dela faria o filtro depender de eu não esquecer um
 * `.eq("client_id", ...)`. Por isso nenhuma função abaixo recebe `clienteId`
 * como parâmetro — `client_id_of_user()` resolve no banco.
 */

export type MesDoCliente = {
  id: string;
  competencia: string;
  passo: Passo;
  datas: DatasDoMes;
  protocolo: string | null;
  semMudancas: boolean;
  recebidaEm: string | null;
  valorDoBoleto: number | null;
  vencimentoDoBoleto: string | null;
  pagaEm: string | null;
  /** Quem cuida da conta na MX, para a pessoa saber com quem fala. */
  analista: string | null;
};

type LinhaDaView = {
  id: string;
  competence: string;
  step: string;
  inform_date: string | null;
  cutoff_date: string | null;
  invoice_date: string;
  due_date: string;
  protocol: string | null;
  no_changes: boolean;
  received_at: string | null;
  invoice_amount: string | number | null;
  invoice_due: string | null;
  paid_at: string | null;
  analyst_name: string | null;
};

function paraMes(v: LinhaDaView): MesDoCliente {
  return {
    id: v.id,
    competencia: competenciaDe(v.competence),
    passo: paraPasso(v.step),
    datas: {
      informar: v.inform_date,
      corte: v.cutoff_date,
      boleto: v.invoice_date,
      vencimento: v.due_date,
    },
    protocolo: v.protocol,
    semMudancas: v.no_changes,
    recebidaEm: v.received_at,
    valorDoBoleto: v.invoice_amount === null ? null : Number(v.invoice_amount),
    vencimentoDoBoleto: v.invoice_due,
    pagaEm: v.paid_at,
    analista: v.analyst_name,
  };
}

const CAMPOS =
  "id, competence, step, inform_date, cutoff_date, invoice_date, due_date, protocol, no_changes, received_at, invoice_amount, invoice_due, paid_at, analyst_name";

/**
 * O mês corrente do cliente — o que a tela chama de "pendência".
 *
 * É o mês mais recente que ainda não terminou. Se todos terminaram, devolve o
 * último, para a tela poder dizer "está tudo em ordem" em vez de ficar em
 * branco: tela vazia faz o gestor ligar para perguntar se está funcionando.
 */
export async function lerMesAtual(): Promise<Resultado<MesDoCliente | null>> {
  try {
    const supabase = await clienteServidor();

    const { data, error } = await supabase
      .from("v_control_board")
      .select(CAMPOS)
      .order("competence", { ascending: false })
      .limit(12);

    if (error) return { dados: null, erro: "Não foi possível carregar o seu mês agora." };

    const meses = ((data ?? []) as unknown as LinhaDaView[]).map(paraMes);
    if (!meses.length) return { dados: null, erro: null };

    const aberto = meses.find((m) => m.passo !== "concluida");
    return { dados: aberto ?? meses[0] ?? null, erro: null };
  } catch {
    return { dados: null, erro: "Não foi possível falar com o banco de dados." };
  }
}

/** Um mês específico, para a tela de envio confirmar que ainda é aquele. */
export async function lerMes(id: string): Promise<Resultado<MesDoCliente | null>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.from("v_control_board").select(CAMPOS).eq("id", id).maybeSingle();

    if (error) return { dados: null, erro: "Não foi possível carregar o mês." };
    if (!data) return { dados: null, erro: null };
    return { dados: paraMes(data as unknown as LinhaDaView), erro: null };
  } catch {
    return { dados: null, erro: "Não foi possível falar com o banco de dados." };
  }
}

/* --------------------------------------------------------------------------
   Contrato
   -------------------------------------------------------------------------- */

export type ContratoDoCliente = {
  seguradora: string | null;
  numero: string;
  produto: string | null;
  vigenciaDe: string | null;
  vigenciaAte: string | null;
};

/**
 * A apólice vigente, para o cartão "Contrato".
 *
 * Responde "o que eu tenho contratado?" sem telefonar.
 *
 * O capital por cargo fica de fora por enquanto: mora em `capital_rule` como
 * jsonb de formato variável (`por_cargo` com faixas, ou `per_capita` com
 * valor), e mostrar metade dele seria pior que não mostrar.
 *
 * Falha aqui devolve `null` com `erro: null` — sem apólice cadastrada o cartão
 * simplesmente não aparece, e isso não é defeito: na Sprint 1 a apólice é
 * opcional, e a maioria dos clientes do CONTROLE FATURAS é só fatura.
 */
export async function lerContrato(): Promise<Resultado<ContratoDoCliente | null>> {
  try {
    const supabase = await clienteServidor();

    const { data, error } = await supabase
      .from("policies")
      .select("policy_number, product_name, valid_from, valid_to, clients(insurers(name))")
      .eq("active", true)
      .order("valid_from", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return { dados: null, erro: null };

    const linha = data as unknown as {
      policy_number: string;
      product_name: string | null;
      valid_from: string | null;
      valid_to: string | null;
      clients: { insurers: { name: string } | { name: string }[] | null } | null;
    };

    const cia = Array.isArray(linha.clients?.insurers) ? linha.clients?.insurers[0] : linha.clients?.insurers;

    return {
      dados: {
        seguradora: cia?.name ?? null,
        numero: linha.policy_number,
        produto: linha.product_name,
        vigenciaDe: linha.valid_from,
        vigenciaAte: linha.valid_to,
      },
      erro: null,
    };
  } catch {
    return { dados: null, erro: null };
  }
}

/* --------------------------------------------------------------------------
   Documentos
   -------------------------------------------------------------------------- */

export type DocumentoDoCliente = {
  id: string;
  tipo: TipoDeArquivo;
  nome: string;
  tamanho: number | null;
  criadoEm: string;
  competencia: string | null;
  protocolo: string | null;
  passo: Passo | null;
};

const TIPO_DO_BANCO: Record<string, TipoDeArquivo> = {
  spreadsheet: "planilha",
  invoice: "boleto",
  policy: "apolice",
};

/**
 * O acervo do cliente, do mais novo para o mais antigo.
 *
 * Agrupar por mês é trabalho da tela. Aqui a ordem é por data, porque é ela que
 * o banco sabe ordenar — a apólice não tem competência e ficaria fora de
 * qualquer agrupamento feito em SQL.
 */
export async function listarMeusDocumentos(): Promise<Resultado<DocumentoDoCliente[]>> {
  try {
    const supabase = await clienteServidor();

    const { data, error } = await supabase
      .from("v_client_documents")
      .select("id, kind, original_name, size_bytes, created_at, competence, protocol, step")
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) return { dados: [], erro: "Não foi possível carregar os seus documentos agora." };

    const linhas = (data ?? []) as unknown as {
      id: string;
      kind: string;
      original_name: string;
      size_bytes: number | null;
      created_at: string;
      competence: string | null;
      protocol: string | null;
      step: string | null;
    }[];

    return {
      dados: linhas.map((l) => ({
        id: l.id,
        tipo: TIPO_DO_BANCO[l.kind] ?? "planilha",
        nome: l.original_name,
        tamanho: l.size_bytes,
        criadoEm: l.created_at,
        competencia: l.competence ? competenciaDe(l.competence) : null,
        protocolo: l.protocol,
        passo: l.step ? paraPasso(l.step) : null,
      })),
      erro: null,
    };
  } catch {
    return { dados: [], erro: "Não foi possível falar com o banco de dados." };
  }
}

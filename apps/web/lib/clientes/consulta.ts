import "server-only";

import { clienteServidor } from "../supabase/servidor";
import { normalizarDocumento } from "../dominio/documento";
import { paraCanal } from "../dominio/mapear";
import type { Produto } from "../dominio/cliente";
import type { Canal } from "../dominio/mensagem";
import { competenciaDe } from "../dominio/controle";

/**
 * Leitura de clientes.
 *
 * Roda com o cliente da SESSÃO: a RLS decide quem vê o quê. A equipe vê todos;
 * o gestor do portal veria só o próprio — mas ele não chega a estas telas.
 *
 * Nada aqui lança: devolve `{ dados, erro }`. Banco fora do ar vira uma faixa
 * de aviso na tela, e não uma tela de erro que esconde o resto do sistema.
 */

export type Resultado<T> = { dados: T; erro: string | null };

export type ClienteDaLista = {
  id: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  documento: string;
  produto: Produto;
  seguradora: string | null;
  canal: Canal;
  corteDia: number | null;
  vencimentoDia: number;
  acompanhaPagamento: boolean;
  ativo: boolean;
};

export type ClienteCompleto = ClienteDaLista & {
  seguradoraId: number | null;
  observacoes: string | null;
  informarDia: number | null;
  boletoDia: number;
  gestorNome: string | null;
  gestorCelular: string | null;
  gestorEmail: string | null;
};

const CAMPOS_DA_LISTA =
  "id, legal_name, trade_name, document, product, channel, cutoff_day, due_day, mx_tracks_payment, active, insurers(name)";

const CAMPOS_COMPLETOS = `${CAMPOS_DA_LISTA}, insurer_id, notes, inform_day, invoice_day, manager_name, manager_phone, manager_email`;

type LinhaDaLista = {
  id: string;
  legal_name: string;
  trade_name: string | null;
  document: string;
  product: Produto;
  channel: string;
  cutoff_day: number | null;
  due_day: number;
  mx_tracks_payment: boolean;
  active: boolean;
  // O PostgREST devolve a relação como objeto ou lista, conforme a cardinalidade.
  insurers: { name: string } | { name: string }[] | null;
};

type LinhaCompleta = LinhaDaLista & {
  insurer_id: number | null;
  notes: string | null;
  inform_day: number | null;
  invoice_day: number;
  manager_name: string | null;
  manager_phone: string | null;
  manager_email: string | null;
};

function nomeDaSeguradora(valor: LinhaDaLista["insurers"]): string | null {
  if (!valor) return null;
  const um = Array.isArray(valor) ? valor[0] : valor;
  return um?.name ?? null;
}

function paraLista(linha: LinhaDaLista): ClienteDaLista {
  return {
    id: linha.id,
    razaoSocial: linha.legal_name,
    nomeFantasia: linha.trade_name,
    documento: linha.document,
    produto: linha.product,
    seguradora: nomeDaSeguradora(linha.insurers),
    canal: paraCanal(linha.channel),
    corteDia: linha.cutoff_day,
    vencimentoDia: linha.due_day,
    acompanhaPagamento: linha.mx_tracks_payment,
    ativo: linha.active,
  };
}

function paraCompleto(linha: LinhaCompleta): ClienteCompleto {
  return {
    ...paraLista(linha),
    seguradoraId: linha.insurer_id,
    observacoes: linha.notes,
    informarDia: linha.inform_day,
    boletoDia: linha.invoice_day,
    gestorNome: linha.manager_name,
    gestorCelular: linha.manager_phone,
    gestorEmail: linha.manager_email,
  };
}

export type FiltroDeClientes = {
  termo?: string;
  situacao?: "ativos" | "inativos" | "todos";
};

export async function listarClientes(filtro: FiltroDeClientes = {}): Promise<Resultado<ClienteDaLista[]>> {
  try {
    const supabase = await clienteServidor();
    let consulta = supabase
      .from("clients")
      .select(CAMPOS_DA_LISTA)
      .is("deleted_at", null)
      .order("legal_name");

    const situacao = filtro.situacao ?? "ativos";
    if (situacao !== "todos") consulta = consulta.eq("active", situacao === "ativos");

    const termo = (filtro.termo ?? "").trim();
    if (termo) {
      const digitos = normalizarDocumento(termo);
      // Quem digita número está procurando CNPJ; quem digita letra, nome. Um
      // `or` com as três colunas atende os dois sem a pessoa escolher onde busca.
      const partes = [`legal_name.ilike.%${termo}%`, `trade_name.ilike.%${termo}%`];
      if (digitos.length >= 3) partes.push(`document.like.${digitos}%`);
      consulta = consulta.or(partes.join(","));
    }

    const { data, error } = await consulta;
    if (error) return { dados: [], erro: "Não foi possível carregar os clientes agora." };

    return { dados: ((data ?? []) as unknown as LinhaDaLista[]).map(paraLista), erro: null };
  } catch {
    return { dados: [], erro: "Não foi possível falar com o banco de dados." };
  }
}

/** Quantos clientes em cada situação — os números das abas da lista. */
export async function contarClientes(): Promise<Resultado<{ ativos: number; inativos: number }>> {
  const vazio = { ativos: 0, inativos: 0 };
  try {
    const supabase = await clienteServidor();
    const [ativos, inativos] = await Promise.all([
      supabase.from("clients").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("active", true),
      supabase.from("clients").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("active", false),
    ]);

    if (ativos.error || inativos.error) return { dados: vazio, erro: "Contagem indisponível." };
    return { dados: { ativos: ativos.count ?? 0, inativos: inativos.count ?? 0 }, erro: null };
  } catch {
    return { dados: vazio, erro: "Contagem indisponível." };
  }
}

export async function lerCliente(id: string): Promise<Resultado<ClienteCompleto | null>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("clients")
      .select(CAMPOS_COMPLETOS)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    // Erro de consulta e ausência de linha não são a mesma coisa: o primeiro é
    // o banco dizendo que não conseguiu, o segundo é "não existe". Tratar os
    // dois como 404 esconde instabilidade atrás de uma tela de "não encontrado".
    if (error) return { dados: null, erro: "Não foi possível carregar o cliente." };
    if (!data) return { dados: null, erro: null };

    return { dados: paraCompleto(data as unknown as LinhaCompleta), erro: null };
  } catch {
    return { dados: null, erro: "Não foi possível falar com o banco de dados." };
  }
}

export type Seguradora = { id: number; nome: string };

export async function listarSeguradoras(): Promise<Resultado<Seguradora[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("insurers")
      .select("id, name")
      .eq("active", true)
      .order("name");

    if (error) return { dados: [], erro: "Lista de seguradoras indisponível." };
    return {
      dados: ((data ?? []) as { id: number; name: string }[]).map((l) => ({ id: l.id, nome: l.name })),
      erro: null,
    };
  } catch {
    return { dados: [], erro: "Lista de seguradoras indisponível." };
  }
}

/* --------------------------------------------------------------------------
   O acervo de um cliente, para a ficha dele
   -------------------------------------------------------------------------- */

export type DocumentoDoAcervo = {
  id: string;
  tipo: "planilha" | "boleto" | "apolice";
  nome: string;
  tamanho: number | null;
  criadoEm: string;
  competencia: string | null;
  protocolo: string | null;
};

const TIPO_DO_ARQUIVO: Record<string, DocumentoDoAcervo["tipo"]> = {
  spreadsheet: "planilha",
  invoice: "boleto",
  policy: "apolice",
};

/**
 * Tudo o que existe de arquivo deste cliente, do mais novo para o mais antigo.
 *
 * Lê `v_client_documents`, a mesma view do portal — a equipe vê por `clients`,
 * o cliente por `client_id_of_user()`, e a RLS resolve a diferença. Duas
 * consultas diferentes para a mesma lista divergiriam na primeira mudança.
 */
export async function listarAcervo(clienteId: string): Promise<Resultado<DocumentoDoAcervo[]>> {
  try {
    const supabase = await clienteServidor();

    const { data, error } = await supabase
      .from("v_client_documents")
      .select("id, kind, original_name, size_bytes, created_at, competence, protocol")
      .eq("client_id", clienteId)
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) return { dados: [], erro: "Não foi possível carregar os documentos." };

    const linhas = (data ?? []) as unknown as {
      id: string;
      kind: string;
      original_name: string;
      size_bytes: number | null;
      created_at: string;
      competence: string | null;
      protocol: string | null;
    }[];

    return {
      dados: linhas.map((l) => ({
        id: l.id,
        tipo: TIPO_DO_ARQUIVO[l.kind] ?? "planilha",
        nome: l.original_name,
        tamanho: l.size_bytes,
        criadoEm: l.created_at,
        competencia: l.competence ? competenciaDe(l.competence) : null,
        protocolo: l.protocol,
      })),
      erro: null,
    };
  } catch {
    return { dados: [], erro: "Não foi possível falar com o banco de dados." };
  }
}

export type BoletoDoCliente = {
  controleId: string;
  competencia: string;
  parcela: string | null;
  valor: number | null;
  vencimento: string | null;
  pagaEm: string | null;
  arquivoId: string | null;
};

/**
 * Os boletos do cliente, mês a mês.
 *
 * Vem de `monthly_controls` e não dos arquivos: um mês pode ter valor e
 * vencimento registrados sem o PDF — a analista lança o que a seguradora
 * informou por e-mail e anexa depois. Listar pelos arquivos esconderia esses.
 */
export async function listarBoletos(clienteId: string): Promise<Resultado<BoletoDoCliente[]>> {
  try {
    const supabase = await clienteServidor();

    const { data, error } = await supabase
      .from("monthly_controls")
      .select("id, competence, invoice_installment, invoice_amount, invoice_due, paid_at, invoice_file_id")
      .eq("client_id", clienteId)
      .not("invoice_attached_at", "is", null)
      .order("competence", { ascending: false })
      .limit(60);

    if (error) return { dados: [], erro: "Não foi possível carregar os boletos." };

    const linhas = (data ?? []) as {
      id: string;
      competence: string;
      invoice_installment: string | null;
      invoice_amount: string | number | null;
      invoice_due: string | null;
      paid_at: string | null;
      invoice_file_id: string | null;
    }[];

    return {
      dados: linhas.map((l) => ({
        controleId: l.id,
        competencia: competenciaDe(l.competence),
        parcela: l.invoice_installment,
        valor: l.invoice_amount === null ? null : Number(l.invoice_amount),
        vencimento: l.invoice_due,
        pagaEm: l.paid_at,
        arquivoId: l.invoice_file_id,
      })),
      erro: null,
    };
  } catch {
    return { dados: [], erro: "Não foi possível falar com o banco de dados." };
  }
}

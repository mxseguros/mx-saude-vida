import "server-only";

import { estadoDoLink, pareceToken, protocoloDaColeta, type EstadoDoLink } from "../dominio/coleta";
import { formatarDocumento } from "../dominio/documento";
import { hojeSaoPaulo } from "../dominio/hoje";
import { paraMovimento, type LinhaMovimento } from "../dominio/mapear";
import type { Movimento } from "../dominio/coleta";
import { clienteAdministrador } from "../supabase/administrador";
import { registrarLog } from "../log";

/**
 * O que a rota pública lê a partir do token.
 *
 * Lê com a CHAVE DE ADMINISTRAÇÃO, que ignora a RLS — não há sessão, e o token
 * é a autoridade. Por isso tudo aqui é escopado pelo token numa consulta só: a
 * RLS não está entre esta função e o banco, então o filtro é a única barreira
 * e não pode depender de quem chama lembrar de aplicá-lo.
 *
 * O que sai daqui é EXATAMENTE o que o gestor pode ver, e nada mais. A linha
 * do Controle tem analista, observação interna, valor de boleto e histórico; o
 * gestor não vê nenhum deles, e esta função não os busca — esconder na tela o
 * que a rota trouxe é uma camada de proteção a menos.
 */

export type ColetaPublica = {
  estado: EstadoDoLink;
  controleId: string;
  competencia: string;
  protocolo: string;

  /** Da empresa, travados na tela: vêm do cadastro, não do formulário. */
  empresa: string;
  documentoDaEmpresa: string;

  /** Os marcos do mês, para o gestor saber o que vem depois. */
  datas: { informar: string | null; corte: string | null; boleto: string; vencimento: string };
  /** O dia, inclusive, até o qual o link abre. */
  valeAte: string;

  /** O contato que a analista registrou ao mandar o link. Pré-preenche a etapa 1. */
  gestor: { nome: string | null; celular: string | null; setor: string | null };

  /** Preenchido quando o gestor já enviou: o que ele mandou. */
  enviado: {
    em: string;
    semMovimentacao: boolean;
    observacao: string | null;
    planilha: { nome: string; tamanho: number } | null;
    movimentos: Movimento[];
  } | null;
};

/**
 * Resolve o token. `null` quando não existe — e `null` também quando o formato
 * não é nosso, sem ir ao banco: `/coleta/` com 4 KB de texto na URL não merece
 * uma consulta, e a rota é aberta na internet.
 */
export async function lerColetaPorToken(token: string, hoje: string = hojeSaoPaulo()): Promise<ColetaPublica | null> {
  if (!pareceToken(token)) return null;

  try {
    const supabase = clienteAdministrador();

    const { data, error } = await supabase
      .from("monthly_controls")
      .select(
        `id, competence, collection_expires_at, received_at, no_changes, received_note,
         manager_name, manager_phone, manager_sector,
         inform_date, cutoff_date, invoice_date, due_date,
         clients!inner(legal_name, trade_name, document, active, deleted_at),
         client_files:spreadsheet_file_id(original_name, size_bytes)`,
      )
      .eq("collection_token", token)
      .maybeSingle();

    if (error) {
      registrarLog("erro", "coleta.leitura", { codigo: error.code });
      return null;
    }
    if (!data) return null;

    const linha = data as unknown as {
      id: string;
      competence: string;
      collection_expires_at: string | null;
      received_at: string | null;
      no_changes: boolean;
      received_note: string | null;
      manager_name: string | null;
      manager_phone: string | null;
      manager_sector: string | null;
      inform_date: string | null;
      cutoff_date: string | null;
      invoice_date: string;
      due_date: string;
      clients: { legal_name: string; trade_name: string | null; document: string; active: boolean; deleted_at: string | null };
      client_files: { original_name: string; size_bytes: number } | null;
    };

    // Cadastro inativado fecha o link na hora. O mês de um cliente que saiu não
    // deveria receber movimentação, e deixar o link abrindo seria a MX pedindo
    // dado pessoal de quem já não é cliente.
    if (!linha.clients.active || linha.clients.deleted_at) return null;

    const valeAte = (linha.collection_expires_at ?? "").slice(0, 10);

    const estado = estadoDoLink(
      { token, valeAte: valeAte || null, recebidoEm: linha.received_at },
      hoje,
    );

    const competencia = linha.competence.slice(0, 7);

    let enviado: ColetaPublica["enviado"] = null;
    if (linha.received_at) {
      // A movimentação vem só quando ele JÁ enviou: numa primeira abertura não
      // há nada para mostrar, e uma consulta a menos é uma consulta a menos
      // numa rota pública.
      const { data: pessoas } = await supabase
        .from("movements")
        .select("id, kind, full_name, document, source")
        .eq("control_id", linha.id)
        .eq("source", "manager")
        .order("kind")
        .order("created_at");

      enviado = {
        em: linha.received_at,
        semMovimentacao: linha.no_changes,
        observacao: linha.received_note,
        planilha: linha.client_files
          ? { nome: linha.client_files.original_name, tamanho: linha.client_files.size_bytes }
          : null,
        movimentos: ((pessoas ?? []) as LinhaMovimento[]).map(paraMovimento),
      };
    }

    return {
      estado,
      controleId: linha.id,
      competencia,
      protocolo: protocoloDaColeta(linha.id, competencia),
      // O nome fantasia primeiro: é por ele que o gestor reconhece a empresa
      // dele. A razão social é o nome do contrato, e às vezes nem ele conhece.
      empresa: linha.clients.trade_name ?? linha.clients.legal_name,
      documentoDaEmpresa: formatarDocumento(linha.clients.document),
      datas: {
        informar: linha.inform_date,
        corte: linha.cutoff_date,
        boleto: linha.invoice_date,
        vencimento: linha.due_date,
      },
      valeAte,
      gestor: {
        nome: linha.manager_name,
        celular: linha.manager_phone,
        setor: linha.manager_sector,
      },
      enviado,
    };
  } catch {
    registrarLog("erro", "coleta.leitura_falhou", {});
    return null;
  }
}

/**
 * O mês por trás do token, para a ESCRITA — só o que ela precisa decidir.
 *
 * Separada de `lerColetaPorToken` porque a pergunta é outra: aqui não interessa
 * o nome da empresa nem os marcos do mês, interessa se este token ainda pode
 * gravar e em que linha. Uma função que servisse às duas traria campos a mais
 * para a rota de escrita, e campo a mais numa rota pública é superfície a mais.
 */
export async function mesDoToken(
  token: string,
  hoje: string = hojeSaoPaulo(),
): Promise<
  | { ok: true; controleId: string; clienteId: string; competencia: string; estado: EstadoDoLink; jaEnviou: boolean }
  | { ok: false; estado: EstadoDoLink }
> {
  if (!pareceToken(token)) return { ok: false, estado: "invalido" };

  try {
    const supabase = clienteAdministrador();

    const { data, error } = await supabase
      .from("monthly_controls")
      .select(
        `id, client_id, competence, step, collection_expires_at, received_at,
         clients!inner(active, deleted_at)`,
      )
      .eq("collection_token", token)
      .maybeSingle();

    if (error || !data) return { ok: false, estado: "invalido" };

    const linha = data as unknown as {
      id: string;
      client_id: string;
      competence: string;
      collection_expires_at: string | null;
      received_at: string | null;
      clients: { active: boolean; deleted_at: string | null };
    };

    if (!linha.clients.active || linha.clients.deleted_at) return { ok: false, estado: "invalido" };

    const estado = estadoDoLink(
      {
        token,
        valeAte: (linha.collection_expires_at ?? "").slice(0, 10) || null,
        recebidoEm: linha.received_at,
      },
      hoje,
    );

    // `enviado` grava: é a decisão #3 — o gestor pode corrigir depois de
    // enviar, e a analista recebe um alerta. `expirado` e `invalido` não.
    if (estado === "expirado" || estado === "invalido") return { ok: false, estado };

    return {
      ok: true,
      controleId: linha.id,
      clienteId: linha.client_id,
      competencia: linha.competence.slice(0, 7),
      estado,
      jaEnviou: linha.received_at !== null,
    };
  } catch {
    return { ok: false, estado: "invalido" };
  }
}

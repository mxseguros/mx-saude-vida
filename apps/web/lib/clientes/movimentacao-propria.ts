import "server-only";

import { nomeCurto } from "../dominio/cliente";
import { clienteServidor } from "../supabase/servidor";
import type { Falha, ResultadoEscrita } from "./servico";

/**
 * Cliente que faz a própria movimentação (07/10): ele informa direto na
 * seguradora, e a MX só envia o boleto e confirma o pagamento.
 */

const falhaGenerica: Falha = { status: 503, codigo: "banco_indisponivel", mensagem: "Não foi possível salvar agora." };

/**
 * Leva os meses EM ABERTO do cliente para "aguardando boleto": quem ainda
 * estava em informar, planilha recebida ou conferida. As datas de coleta saem
 * e o link de coleta deixa de abrir. Meses já no boleto em diante ficam.
 * Cada mês mudado ganha evento na linha do tempo.
 */
export async function aplicarNosMesesAbertos(clienteId: string, autor: string): Promise<number> {
  const supabase = await clienteServidor();
  const { data } = await supabase
    .from("monthly_controls")
    .select("id, step")
    .eq("client_id", clienteId)
    .in("step", ["inform", "spreadsheet_received", "checked"]);

  let mudados = 0;
  for (const mes of (data ?? []) as { id: string; step: string }[]) {
    const { error } = await supabase
      .from("monthly_controls")
      .update({
        step: "cutoff",
        inform_date: null,
        cutoff_date: null,
        confirm_date: null,
        collection_token: null,
        collection_expires_at: null,
      })
      .eq("id", mes.id)
      .eq("step", mes.step);
    if (error) continue;
    await supabase.from("control_events").insert({
      control_id: mes.id,
      type: "step_changed",
      origin: "staff",
      actor_profile_id: autor,
      from_step: mes.step,
      to_step: "cutoff",
      note: "O cliente passou a fazer a própria movimentação: o mês segue direto para o boleto.",
    });
    mudados += 1;
  }
  return mudados;
}

export type ClienteDaLista = {
  id: string;
  nome: string;
  documento: string;
  produto: string;
  jaMarcado: boolean;
};

export type PreviaEmLote = { encontrados: ClienteDaLista[]; naoEncontrados: string[] };

/** Quem da lista colada existe no cadastro (ativos). Nada é gravado. */
export async function previaEmLote(documentos: string[]): Promise<ResultadoEscrita<PreviaEmLote>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("clients")
      .select("id, legal_name, trade_name, document, product, self_managed")
      .in("document", documentos)
      .is("deleted_at", null)
      .order("legal_name");
    if (error) return { ok: false, falha: falhaGenerica };

    const linhas = (data ?? []) as {
      id: string;
      legal_name: string;
      trade_name: string | null;
      document: string;
      product: string;
      self_managed: boolean;
    }[];
    const achados = new Set(linhas.map((l) => l.document));
    return {
      ok: true,
      dados: {
        encontrados: linhas.map((l) => ({
          id: l.id,
          nome: nomeCurto({ razaoSocial: l.legal_name, nomeFantasia: l.trade_name }),
          documento: l.document,
          produto: l.product,
          jaMarcado: l.self_managed,
        })),
        naoEncontrados: documentos.filter((d) => !achados.has(d)),
      },
    };
  } catch {
    return { ok: false, falha: falhaGenerica };
  }
}

/** Marca os clientes e leva os meses abertos deles para o boleto. */
export async function marcarEmLote(
  ids: string[],
  autor: string,
): Promise<ResultadoEscrita<{ marcados: number; mesesAjustados: number }>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("clients")
      .update({ self_managed: true, inform_day: null, cutoff_day: null, confirm_day: null })
      .in("id", ids)
      .is("deleted_at", null)
      .select("id");
    if (error) return { ok: false, falha: falhaGenerica };

    let mesesAjustados = 0;
    for (const { id } of (data ?? []) as { id: string }[]) mesesAjustados += await aplicarNosMesesAbertos(id, autor);
    return { ok: true, dados: { marcados: (data ?? []).length, mesesAjustados } };
  } catch {
    return { ok: false, falha: falhaGenerica };
  }
}

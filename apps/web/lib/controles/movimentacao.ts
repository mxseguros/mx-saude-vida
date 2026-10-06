import "server-only";

import type { Movimento } from "../dominio/coleta";
import { paraMovimento, type LinhaMovimento } from "../dominio/mapear";
import { clienteServidor } from "../supabase/servidor";

/**
 * Quem entrou e quem saiu, como a equipe vê.
 *
 * Lê com o cliente da SESSÃO: a RLS confere que quem pede é da equipe. É o
 * contrário da rota pública, onde não há sessão e o token é a autoridade.
 *
 * Devolve lista vazia em qualquer falha, de propósito. Esta consulta alimenta a
 * tela de conferir, que já tem o que mostrar sem ela — a planilha. Derrubar a
 * conferência inteira porque a movimentação digitada não carregou seria trocar
 * o trabalho do mês por uma mensagem de erro.
 */
export async function lerMovimentacao(controleId: string): Promise<Movimento[]> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("movements")
      .select("id, kind, full_name, document, birth_date, job_title, salary, source")
      .eq("control_id", controleId)
      // Entradas antes de saídas, e dentro de cada uma a ordem em que
      // chegaram: é como o gestor digitou, e é como ele vai ler de volta se a
      // analista o chamar para conferir junto.
      .order("kind")
      .order("created_at");

    if (error || !data) return [];
    return (data as LinhaMovimento[]).map(paraMovimento);
  } catch {
    return [];
  }
}

import { erroJson, exigirEscrita } from "@/lib/api";
import { clienteServidor } from "@/lib/supabase/servidor";

/**
 * POST — confirmar a emissão da fatura (5ª data do v0.7).
 *
 * Carimbo, não passo: o mês segue na máquina como estava. Vira evento, e sem o
 * evento o carimbo volta (regra 4).
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await exigirEscrita();
  if (!sessao.ok) return sessao.resposta;
  const { id } = await params;

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("monthly_controls")
      .update({ issue_confirmed_at: new Date().toISOString(), issue_confirmed_by: sessao.perfil.id })
      .eq("id", id)
      .not("confirm_date", "is", null)
      .is("issue_confirmed_at", null)
      .select("id")
      .maybeSingle();

    if (error) return erroJson(503, "banco_indisponivel", "Não foi possível salvar agora. Tente de novo.");
    if (!data) return erroJson(409, "nada_a_confirmar", "Este mês já foi confirmado ou não tem confirmação de emissão.");

    const { error: erroEvento } = await supabase.from("control_events").insert({
      control_id: id,
      type: "issue_confirmed",
      origin: "staff",
      actor_profile_id: sessao.perfil.id,
      note: "Emissão da fatura confirmada com a seguradora.",
    });

    if (erroEvento) {
      await supabase.from("monthly_controls").update({ issue_confirmed_at: null, issue_confirmed_by: null }).eq("id", id);
      return erroJson(503, "evento_falhou", "A confirmação foi desfeita porque não consegui registrá-la no histórico.");
    }

    return Response.json({ data: { id } });
  } catch {
    return erroJson(503, "banco_indisponivel", "Não foi possível falar com o servidor.");
  }
}

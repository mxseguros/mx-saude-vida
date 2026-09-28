import { erroJson, exigirEscrita, lerCorpo } from "@/lib/api";
import { abrirCompetencia } from "@/lib/controles/servico";

/**
 * POST /api/v1/controles  { competencia: "2026-09" }
 *
 * Abre o mês: uma linha por cliente ativo, com as quatro datas já calculadas.
 * Idempotente — chamar de novo abre só quem faltava.
 */
export async function POST(request: Request) {
  const sessao = await exigirEscrita();
  if (!sessao.ok) return sessao.resposta;

  const corpo = (await lerCorpo(request)) as { competencia?: unknown } | null;
  const competencia = typeof corpo?.competencia === "string" ? corpo.competencia : "";

  if (!/^\d{4}-\d{2}$/.test(competencia)) {
    return erroJson(400, "competencia_invalida", "Informe a competência no formato AAAA-MM.", "competencia");
  }

  const resultado = await abrirCompetencia(competencia);
  if (!resultado.ok) {
    const { status, codigo, mensagem } = resultado.falha;
    return erroJson(status, codigo, mensagem);
  }

  return Response.json({ data: resultado.dados }, { status: 201 });
}

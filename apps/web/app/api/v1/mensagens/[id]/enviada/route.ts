import { erroJson, exigirEscrita } from "@/lib/api";
import { concluirMensagem } from "@/lib/controles/servico";

/**
 * POST /api/v1/mensagens/[id]/enviada — a analista abriu a mensagem da fila no
 * Outlook ou no WhatsApp. Pendente vira enviada, com evento na linha do tempo.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await exigirEscrita();
  if (!sessao.ok) return sessao.resposta;

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return erroJson(404, "nao_encontrada", "Mensagem não encontrada.");

  const r = await concluirMensagem(id, sessao.perfil.id);
  if (!r.ok) return erroJson(r.falha.status, r.falha.codigo, r.falha.mensagem);
  return Response.json({ data: r.dados });
}

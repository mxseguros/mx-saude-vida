import { erroJson, exigirEscrita, lerCorpo } from "@/lib/api";
import { aplicarAcaoNoControle } from "@/lib/controles/servico";

/**
 * POST /api/v1/controles/[id]/pago  { observacao? }
 *
 * Marca o boleto como pago e fecha o mês.
 *
 * A rota não confere o passo: quem confere é `aplicarAcao`, pela máquina de
 * estados, e ela devolve 409 quando a ação não cabe. Duplicar a regra aqui
 * criaria um segundo lugar para ela divergir.
 *
 * Não existe "desmarcar pago". Fechar o mês é registrar que o dinheiro entrou,
 * e desfazer isso por um clique errado seria reabrir cobrança — o caminho é a
 * analista lançar uma observação, que fica no histórico.
 */
export const runtime = "nodejs";

export async function POST(request: Request, contexto: { params: Promise<{ id: string }> }) {
  const sessao = await exigirEscrita();
  if (!sessao.ok) return sessao.resposta;

  const { id } = await contexto.params;
  const corpo = await lerCorpo(request);

  const bruta = (corpo as Record<string, unknown> | null)?.observacao;
  const observacao = typeof bruta === "string" && bruta.trim() ? bruta.trim() : null;

  const resultado = await aplicarAcaoNoControle(id, "marcar_pago", sessao.perfil.id, { observacao });

  if (!resultado.ok) {
    const { status, codigo, mensagem } = resultado.falha;
    return erroJson(status, codigo, mensagem);
  }

  return Response.json({ data: resultado.dados }, { status: 201 });
}

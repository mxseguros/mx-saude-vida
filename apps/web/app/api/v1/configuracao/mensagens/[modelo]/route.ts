import { erroJson, exigirAdmin, lerCorpo } from "@/lib/api";
import { salvarModelo } from "@/lib/configuracao/servico";
import { CANAIS } from "@/lib/dominio/cliente";
import type { Canal } from "@/lib/dominio/mensagem";
import type { ModeloDeMensagem } from "@/lib/dominio/controle";

/**
 * Salvar o texto de um dos cinco modelos.
 *
 * O modelo vem da URL, não do corpo, e é conferido contra a lista fechada: o
 * `kind` é chave primária em `message_templates`, e um valor livre no corpo
 * viraria um update que não acerta linha nenhuma — silencioso, e a analista só
 * descobriria no mês seguinte, quando o texto antigo saísse de novo.
 */
const MODELOS: ModeloDeMensagem[] = ["informar", "corte", "boleto", "vencimento", "correcao"];

export async function PATCH(request: Request, { params }: { params: Promise<{ modelo: string }> }) {
  const sessao = await exigirAdmin();
  if (!sessao.ok) return sessao.resposta;

  const { modelo } = await params;
  if (!MODELOS.includes(modelo as ModeloDeMensagem)) {
    return erroJson(404, "modelo_desconhecido", "Este modelo de mensagem não existe.");
  }

  const corpo = await lerCorpo(request);
  if (!corpo || typeof corpo !== "object") {
    return erroJson(400, "corpo_invalido", "Envio malformado.");
  }

  const { assunto, texto, canalPadrao } = corpo as Record<string, unknown>;

  if (canalPadrao !== undefined && (typeof canalPadrao !== "string" || !CANAIS.includes(canalPadrao as Canal))) {
    return erroJson(400, "canal_invalido", "Canal desconhecido.", "canalPadrao");
  }

  const dados: { assunto?: string; corpo?: string; canalPadrao?: Canal } = {};
  if (typeof assunto === "string") dados.assunto = assunto;
  if (typeof texto === "string") dados.corpo = texto;
  if (typeof canalPadrao === "string") dados.canalPadrao = canalPadrao as Canal;

  if (!Object.keys(dados).length) {
    return erroJson(400, "nada_a_mudar", "Nenhum campo para alterar.");
  }

  const resultado = await salvarModelo(modelo as ModeloDeMensagem, dados, sessao.perfil.id);
  if (!resultado.ok) {
    const { status, codigo, mensagem, campo } = resultado.falha;
    return erroJson(status, codigo, mensagem, campo);
  }

  return Response.json({ data: { modelo } });
}

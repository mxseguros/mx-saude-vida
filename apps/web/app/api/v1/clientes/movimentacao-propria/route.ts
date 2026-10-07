import { erroJson, exigirEscrita, lerCorpo } from "@/lib/api";
import { marcarEmLote, previaEmLote } from "@/lib/clientes/movimentacao-propria";
import { extrairDocumentos } from "@/lib/dominio/documento";

/**
 * POST — marcar em lote os clientes que fazem a própria movimentação.
 *
 * `{ texto }` devolve a prévia (quem foi achado e quem não); `{ ids }` grava.
 * A lista vem colada na tela e nunca fica guardada: são CNPJs e CPFs reais.
 */
export async function POST(request: Request) {
  const sessao = await exigirEscrita();
  if (!sessao.ok) return sessao.resposta;

  const corpo = (await lerCorpo(request)) as { texto?: unknown; ids?: unknown } | null;
  if (!corpo) return erroJson(400, "corpo_invalido", "Envio malformado.");

  if (Array.isArray(corpo.ids)) {
    const ids = corpo.ids.filter((v): v is string => typeof v === "string").slice(0, 500);
    if (!ids.length) return erroJson(422, "sem_clientes", "Nenhum cliente selecionado.");
    const r = await marcarEmLote(ids, sessao.perfil.id);
    if (!r.ok) return erroJson(r.falha.status, r.falha.codigo, r.falha.mensagem);
    return Response.json({ data: r.dados });
  }

  const texto = typeof corpo.texto === "string" ? corpo.texto.slice(0, 50_000) : "";
  const documentos = extrairDocumentos(texto);
  if (!documentos.length) {
    return erroJson(422, "sem_documentos", "Não achei nenhum CNPJ ou CPF válido no texto colado.", "texto");
  }
  const r = await previaEmLote(documentos);
  if (!r.ok) return erroJson(r.falha.status, r.falha.codigo, r.falha.mensagem);
  return Response.json({ data: { ...r.dados, lidos: documentos.length } });
}

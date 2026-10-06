import { erroJson, exigirEscrita } from "@/lib/api";
import { salvarApolice } from "@/lib/clientes/apolice";
import { esquemaApoliceDoCadastro } from "@/lib/dominio/apolice";
import { validar } from "@/lib/dominio/validar";

/**
 * PUT /api/v1/clientes/[id]/apolice — grava o que a analista conferiu.
 *
 * Multipart: `dados` (JSON do formulário) e, se houver, `arquivo` (o PDF, que
 * fica no acervo do cliente).
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await exigirEscrita();
  if (!sessao.ok) return sessao.resposta;
  const { id } = await params;

  let formulario: FormData;
  let bruto: unknown;
  try {
    formulario = await request.formData();
    bruto = JSON.parse(String(formulario.get("dados") ?? ""));
  } catch {
    return erroJson(400, "corpo_invalido", "Envio malformado.");
  }

  const analise = validar(esquemaApoliceDoCadastro, bruto);
  if (!analise.ok) {
    return Response.json(
      { error: { code: "campos_invalidos", message: "Confira os campos destacados.", fields: analise.erros } },
      { status: 422 },
    );
  }

  const arquivo = formulario.get("arquivo");
  const resultado = await salvarApolice(id, analise.dados, arquivo instanceof File ? arquivo : null, sessao.perfil.id);
  if (!resultado.ok) {
    const { status, codigo, mensagem } = resultado.falha;
    return erroJson(status, codigo, mensagem);
  }
  return Response.json({ data: resultado.dados });
}

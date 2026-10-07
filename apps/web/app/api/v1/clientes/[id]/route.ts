import { aplicarNosMesesAbertos } from "@/lib/clientes/movimentacao-propria";
import { erroJson, exigirEscrita, exigirPerfil, lerCorpo } from "@/lib/api";
import { lerCliente } from "@/lib/clientes/consulta";
import { editarCliente, inativarCliente, reativarCliente } from "@/lib/clientes/servico";
import { esquemaCliente } from "@/lib/dominio/cliente";
import { validar } from "@/lib/dominio/validar";

export async function GET(_request: Request, contexto: { params: Promise<{ id: string }> }) {
  const sessao = await exigirPerfil();
  if (!sessao.ok) return sessao.resposta;

  const { id } = await contexto.params;
  const resultado = await lerCliente(id);

  if (resultado.erro) return erroJson(503, "consulta_indisponivel", resultado.erro);
  if (!resultado.dados) return erroJson(404, "nao_encontrado", "Este cliente não existe.");

  return Response.json({ data: resultado.dados });
}

export async function PATCH(request: Request, contexto: { params: Promise<{ id: string }> }) {
  const sessao = await exigirEscrita();
  if (!sessao.ok) return sessao.resposta;

  const { id } = await contexto.params;
  const corpo = await lerCorpo(request);
  if (!corpo) return erroJson(400, "corpo_invalido", "Envio malformado.");

  const analise = validar(esquemaCliente, corpo);
  if (!analise.ok) {
    return Response.json(
      {
        error: { code: "campos_invalidos", message: "Confira os campos destacados.", fields: analise.erros },
      },
      { status: 422 },
    );
  }

  const resultado = await editarCliente(id, analise.dados);
  if (!resultado.ok) {
    const { status, codigo, mensagem, campo } = resultado.falha;
    return erroJson(status, codigo, mensagem, campo);
  }

  // Marcado "faz a própria movimentação": o mês em aberto já segue para o boleto.
  const mesesAjustados = analise.dados.movimentacaoPropria
    ? await aplicarNosMesesAbertos(id, sessao.perfil.id)
    : 0;

  return Response.json({ data: { ...resultado.dados, mesesAjustados } });
}

/**
 * DELETE /api/v1/clientes/[id] — inativa, não apaga.
 *
 * "Remover é desativar": o histórico de movimentações, documentos e boletos
 * fica, e o portal do cliente fecha na hora. `?reativar=1` desfaz.
 */
export async function DELETE(request: Request, contexto: { params: Promise<{ id: string }> }) {
  const sessao = await exigirEscrita();
  if (!sessao.ok) return sessao.resposta;

  const { id } = await contexto.params;
  const params = new URL(request.url).searchParams;

  const resultado =
    params.get("reativar") === "1"
      ? await reativarCliente(id)
      : await inativarCliente(id, params.get("motivo"));

  if (!resultado.ok) {
    const { status, codigo, mensagem, campo } = resultado.falha;
    return erroJson(status, codigo, mensagem, campo);
  }

  return Response.json({ data: resultado.dados });
}

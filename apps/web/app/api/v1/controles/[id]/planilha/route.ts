import { enviarArquivo } from "@/lib/arquivos/servico";
import { lerControle } from "@/lib/controles/consulta";
import { erroJson, exigirEscrita } from "@/lib/api";

/**
 * A planilha do mês, anexada pela analista (etapa 4 da coleta).
 *
 * Cliente e competência vêm do MÊS, nunca do corpo: o caminho no bucket começa
 * pelo `client_id`. O arquivo só é ligado ao mês quando a coleta é registrada.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await exigirEscrita();
  if (!sessao.ok) return sessao.resposta;

  const { id } = await params;
  const controle = await lerControle(id);
  if (controle.erro) return erroJson(503, "consulta_indisponivel", controle.erro);
  if (!controle.dados) return erroJson(404, "nao_encontrado", "Esta movimentação não existe.");

  let formulario: FormData;
  try {
    formulario = await request.formData();
  } catch {
    return erroJson(400, "corpo_invalido", "Envio malformado.");
  }

  const arquivo = formulario.get("arquivo");
  if (!(arquivo instanceof File)) return erroJson(422, "arquivo_faltando", "Escolha o arquivo da planilha.");

  const resultado = await enviarArquivo(
    {
      clienteId: controle.dados.clienteId,
      controleId: id,
      competencia: controle.dados.competencia,
      tipo: "planilha",
      arquivo,
    },
    { perfilId: sessao.perfil.id },
  );

  if (!resultado.ok) {
    const { status, codigo, mensagem } = resultado.falha;
    return erroJson(status, codigo, mensagem);
  }
  return Response.json({ data: { id: resultado.dados.id, nome: resultado.dados.nome } }, { status: 201 });
}

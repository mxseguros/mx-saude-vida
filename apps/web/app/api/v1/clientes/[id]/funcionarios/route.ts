import { erroJson, exigirEscrita, lerCorpo } from "@/lib/api";
import { esquemaFuncionario } from "@/lib/dominio/funcionario";
import { validar } from "@/lib/dominio/validar";
import { criarFuncionario } from "@/lib/funcionarios/servico";

/** POST — adicionar funcionário, ou readmitir (vínculo novo com o mesmo CPF). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await exigirEscrita();
  if (!sessao.ok) return sessao.resposta;
  const { id } = await params;

  const corpo = await lerCorpo(request);
  if (!corpo) return erroJson(400, "corpo_invalido", "Envio malformado.");
  const analise = validar(esquemaFuncionario, corpo);
  if (!analise.ok) {
    return Response.json(
      { error: { code: "campos_invalidos", message: "Confira os campos destacados.", fields: analise.erros } },
      { status: 422 },
    );
  }

  const r = await criarFuncionario(id, analise.dados, sessao.perfil.id);
  if (!r.ok) return erroJson(r.falha.status, r.falha.codigo, r.falha.mensagem, r.falha.campo);
  return Response.json({ data: r.dados }, { status: 201 });
}

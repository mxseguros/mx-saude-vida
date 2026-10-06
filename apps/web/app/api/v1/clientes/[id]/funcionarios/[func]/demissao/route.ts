import { erroJson, exigirEscrita, lerCorpo } from "@/lib/api";
import { esquemaDemissao } from "@/lib/dominio/funcionario";
import { validar } from "@/lib/dominio/validar";
import { demitirFuncionario } from "@/lib/funcionarios/servico";

/** POST — demitir. A linha fica no histórico; readmitir abre outra. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; func: string }> }) {
  const sessao = await exigirEscrita();
  if (!sessao.ok) return sessao.resposta;
  const { id, func } = await params;

  const corpo = await lerCorpo(request);
  if (!corpo) return erroJson(400, "corpo_invalido", "Envio malformado.");
  const analise = validar(esquemaDemissao, corpo);
  if (!analise.ok) {
    return Response.json(
      { error: { code: "campos_invalidos", message: "Confira os campos destacados.", fields: analise.erros } },
      { status: 422 },
    );
  }

  const r = await demitirFuncionario(id, func, analise.dados.saida!, analise.dados.motivo);
  if (!r.ok) return erroJson(r.falha.status, r.falha.codigo, r.falha.mensagem, r.falha.campo);
  return Response.json({ data: r.dados });
}

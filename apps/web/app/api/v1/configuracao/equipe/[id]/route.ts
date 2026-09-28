import { erroJson, exigirAdmin, lerCorpo } from "@/lib/api";
import { desativarPessoa, editarPessoa, excluirPessoa, reativarPessoa } from "@/lib/configuracao/servico";
import { PAPEIS, type Papel } from "@/lib/dominio/tipos";

/**
 * Editar, reativar, desativar e excluir um acesso.
 *
 * `PATCH` com `{ ativo: true }` reativa; com qualquer outro campo, edita. São
 * caminhos separados no serviço porque reativar é a única mudança que devolve
 * poder a alguém — e misturá-la com a edição faria um `nome` novo carregar de
 * carona um acesso restaurado sem ninguém decidir isso.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await exigirAdmin();
  if (!sessao.ok) return sessao.resposta;

  const { id } = await params;
  const corpo = await lerCorpo(request);
  if (!corpo || typeof corpo !== "object") {
    return erroJson(400, "corpo_invalido", "Envio malformado.");
  }

  const { ativo, nome, email, papel, senha } = corpo as Record<string, unknown>;

  if (ativo === true) {
    const resultado = await reativarPessoa(id);
    if (!resultado.ok) {
      const { status, codigo, mensagem } = resultado.falha;
      return erroJson(status, codigo, mensagem);
    }
    return Response.json({ data: { id, ativo: true } });
  }

  if (papel !== undefined && (typeof papel !== "string" || !PAPEIS.includes(papel as Papel))) {
    return erroJson(400, "papel_invalido", "Perfil desconhecido.", "papel");
  }

  const dados: { nome?: string; email?: string; papel?: Papel; senha?: string } = {};
  if (typeof nome === "string") dados.nome = nome;
  if (typeof email === "string") dados.email = email;
  if (typeof papel === "string") dados.papel = papel as Papel;
  if (typeof senha === "string") dados.senha = senha;

  if (!Object.keys(dados).length) {
    return erroJson(400, "nada_a_mudar", "Nenhum campo para alterar.");
  }

  const resultado = await editarPessoa(id, dados, sessao.perfil.id);
  if (!resultado.ok) {
    const { status, codigo, mensagem, campo } = resultado.falha;
    return erroJson(status, codigo, mensagem, campo);
  }

  return Response.json({ data: { id } });
}

/**
 * Tirar o acesso.
 *
 * Sem `?definitivo=1` é DESATIVAR, que é o caminho normal: o histórico precisa
 * do nome de quem conferiu cada planilha. A exclusão de verdade existe só para
 * o acesso criado por engano, e o serviço a recusa para quem já assinou algo.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await exigirAdmin();
  if (!sessao.ok) return sessao.resposta;

  const { id } = await params;
  const definitivo = new URL(request.url).searchParams.get("definitivo") === "1";

  const resultado = definitivo
    ? await excluirPessoa(id, sessao.perfil.id)
    : await desativarPessoa(id, sessao.perfil.id);

  if (!resultado.ok) {
    const { status, codigo, mensagem } = resultado.falha;
    return erroJson(status, codigo, mensagem);
  }

  return Response.json({ data: { id, excluido: definitivo } });
}

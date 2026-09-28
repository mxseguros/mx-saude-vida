import { erroJson, exigirAdmin, lerCorpo } from "@/lib/api";
import { criarPessoa } from "@/lib/configuracao/servico";
import { PAPEIS, type Papel } from "@/lib/dominio/tipos";

/**
 * Criar acesso para alguém da equipe.
 *
 * A senha vem no corpo porque é o administrador quem a define — ele a entrega
 * em mão. Ela não volta na resposta e não fica em log nenhum: a tela mostra
 * uma vez o que ela mesma enviou, e é só isso.
 */
export async function POST(request: Request) {
  const sessao = await exigirAdmin();
  if (!sessao.ok) return sessao.resposta;

  const corpo = await lerCorpo(request);
  if (!corpo || typeof corpo !== "object") {
    return erroJson(400, "corpo_invalido", "Envio malformado.");
  }

  const { email, nome, papel, senha } = corpo as Record<string, unknown>;

  if (typeof email !== "string" || typeof nome !== "string" || typeof senha !== "string") {
    return erroJson(400, "campos_faltando", "Informe nome, e-mail e senha.");
  }
  if (typeof papel !== "string" || !PAPEIS.includes(papel as Papel)) {
    return erroJson(400, "papel_invalido", "Perfil desconhecido.", "papel");
  }

  const resultado = await criarPessoa(email, nome, papel as Papel, senha);
  if (!resultado.ok) {
    const { status, codigo, mensagem, campo } = resultado.falha;
    return erroJson(status, codigo, mensagem, campo);
  }

  return Response.json({ data: { criado: true } }, { status: 201 });
}

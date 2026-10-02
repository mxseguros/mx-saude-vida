import { erroJson, exigirEscrita, lerCorpo } from "@/lib/api";
import { definirAcessoAtivo, listarAcessos, redefinirSenhaDoPortal } from "@/lib/clientes/acesso";

/**
 * PATCH /api/v1/clientes/[id]/acesso/[usuario]  { ativo? , senha? }
 *
 * Liga, desliga ou troca a senha de um acesso ao portal.
 *
 * O `usuario` é conferido contra o CLIENTE da URL antes de qualquer escrita. Sem
 * isso, um id de gestor de outra empresa trocaria de senha por aqui — a troca de
 * senha usa a chave de administração, que ignora a RLS.
 */
export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  contexto: { params: Promise<{ id: string; usuario: string }> },
) {
  const sessao = await exigirEscrita();
  if (!sessao.ok) return sessao.resposta;

  const { id, usuario } = await contexto.params;

  // `listarAcessos` passa pela RLS: gestor de outro cliente não aparece, e a
  // resposta é 404 — dizer "existe, mas não é deste cliente" contaria a quem
  // procura que o id acertou.
  const acessos = await listarAcessos(id);
  if (acessos.erro) return erroJson(503, "consulta_indisponivel", acessos.erro);
  if (!acessos.dados.some((a) => a.id === usuario)) {
    return erroJson(404, "nao_encontrado", "Este acesso não existe neste cliente.");
  }

  const corpo = await lerCorpo(request);
  if (!corpo || typeof corpo !== "object") {
    return erroJson(400, "corpo_invalido", "Envio malformado.");
  }

  const { ativo, senha } = corpo as Record<string, unknown>;

  if (typeof senha === "string") {
    const resultado = await redefinirSenhaDoPortal(usuario, senha);
    if (!resultado.ok) {
      const { status, codigo, mensagem, campo } = resultado.falha;
      return erroJson(status, codigo, mensagem, campo);
    }
    return Response.json({ data: { id: usuario, senhaTrocada: true } });
  }

  if (typeof ativo === "boolean") {
    const resultado = await definirAcessoAtivo(usuario, ativo);
    if (!resultado.ok) {
      const { status, codigo, mensagem } = resultado.falha;
      return erroJson(status, codigo, mensagem);
    }
    return Response.json({ data: { id: usuario, ativo } });
  }

  return erroJson(400, "nada_a_mudar", "Nenhum campo para alterar.");
}

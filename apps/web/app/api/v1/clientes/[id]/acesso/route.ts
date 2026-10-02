import { erroJson, exigirEscrita, lerCorpo } from "@/lib/api";
import { criarAcessoDoPortal } from "@/lib/clientes/acesso";
import { lerCliente } from "@/lib/clientes/consulta";
import { digitosDoTelefone } from "@/lib/dominio/telefone";

/**
 * POST /api/v1/clientes/[id]/acesso  { nome, email, telefone?, senha }
 *
 * Cria o acesso de um gestor do cliente ao portal.
 *
 * A senha vem no corpo porque é a analista quem a define e entrega — o convite
 * por e-mail dependeria do gancho do Supabase, que ainda não está ligado. Ela
 * não volta na resposta e não entra em log: a tela mostra uma vez o que ela
 * mesma enviou.
 */
export const runtime = "nodejs";

export async function POST(request: Request, contexto: { params: Promise<{ id: string }> }) {
  const sessao = await exigirEscrita();
  if (!sessao.ok) return sessao.resposta;

  const { id } = await contexto.params;

  // O cliente tem de existir E ser visível para quem está criando. `lerCliente`
  // passa pela RLS, então não há como criar acesso para um cadastro alheio.
  const cliente = await lerCliente(id);
  if (cliente.erro) return erroJson(503, "consulta_indisponivel", cliente.erro);
  if (!cliente.dados) return erroJson(404, "nao_encontrado", "Este cliente não existe.");

  const corpo = await lerCorpo(request);
  if (!corpo || typeof corpo !== "object") {
    return erroJson(400, "corpo_invalido", "Envio malformado.");
  }

  const { nome, email, telefone, senha } = corpo as Record<string, unknown>;

  if (typeof nome !== "string" || typeof email !== "string" || typeof senha !== "string") {
    return erroJson(400, "campos_faltando", "Informe nome, e-mail e senha.");
  }

  const celular = typeof telefone === "string" && telefone.trim() ? digitosDoTelefone(telefone) : null;

  const resultado = await criarAcessoDoPortal(
    id,
    { nome, email, telefone: celular, senha },
    sessao.perfil.id,
  );

  if (!resultado.ok) {
    const { status, codigo, mensagem, campo } = resultado.falha;
    return erroJson(status, codigo, mensagem, campo);
  }

  return Response.json({ data: { id: resultado.dados.id } }, { status: 201 });
}

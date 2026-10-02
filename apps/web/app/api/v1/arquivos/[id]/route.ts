import { erroJson, exigirPerfil } from "@/lib/api";
import { urlAssinada } from "@/lib/arquivos/servico";

/**
 * GET /api/v1/arquivos/[id] — download para a EQUIPE.
 *
 * Gêmea de `/api/portal/arquivo/[id]`, que serve o cliente. São duas rotas
 * porque são dois públicos e duas guardas: aqui entra quem tem perfil, lá quem
 * tem `client_user`. Uma rota só com dois caminhos de autorização dentro é onde
 * mora o erro que entrega arquivo errado.
 *
 * `exigirPerfil` e não `exigirEscrita`: o perfil de leitura baixa documento, ele
 * só não altera cadastro.
 *
 * Redireciona para a URL assinada de 2 minutos, com `no-store`: uma resposta de
 * redirecionamento em cache entregaria depois um endereço expirado, ou — pior —
 * um endereço válido a quem não deveria ter.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, contexto: { params: Promise<{ id: string }> }) {
  const sessao = await exigirPerfil();
  if (!sessao.ok) return sessao.resposta;

  const { id } = await contexto.params;

  const resultado = await urlAssinada(id);
  if (!resultado.ok) {
    const { status, codigo, mensagem } = resultado.falha;
    return erroJson(status, codigo, mensagem);
  }

  return new Response(null, {
    status: 302,
    headers: { Location: resultado.dados.url, "Cache-Control": "no-store" },
  });
}

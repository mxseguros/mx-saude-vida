import { erroJson } from "@/lib/api";
import { exigirCliente } from "@/lib/portal/sessao";
import { urlAssinada } from "@/lib/arquivos/servico";

/**
 * GET /api/portal/arquivo/[id] — redireciona para a URL assinada do download.
 *
 * Redirecionamento, e não JSON com a URL dentro: assim o link em Meus documentos
 * é um `<a href>` comum, que funciona no clique do meio, no "salvar como" e no
 * celular — sem JavaScript no caminho.
 *
 * Quem pode baixar é decidido pela RLS na leitura da ficha, com o cliente da
 * sessão. Arquivo de outra empresa não é encontrado e a resposta é 404.
 *
 * `no-store` é obrigatório: a URL assinada vive dois minutos, e uma resposta de
 * redirecionamento guardada em cache entregaria depois um endereço já expirado —
 * ou, pior, um endereço válido a quem não deveria ter.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, contexto: { params: Promise<{ id: string }> }) {
  const sessao = await exigirCliente();
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

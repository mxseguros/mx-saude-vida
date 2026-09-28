import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

type CookieParaGravar = { name: string; value: string; options: CookieOptions };
import { chavePublicavel, urlSupabase } from "../ambiente";

/**
 * Renova a sessao e diz se ha alguem logado.
 *
 * NUNCA lanca. Um throw aqui derruba TODAS as rotas, nao so a que falhou —
 * foi o que aconteceu no commit 58ae53f do produto anterior. Falhou? Trata
 * como "sem sessao" e deixa o middleware decidir para onde mandar.
 */
export async function renovarSessao(request: NextRequest) {
  let resposta = NextResponse.next({ request });

  try {
    const supabase = createServerClient(urlSupabase(), chavePublicavel(), {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(lista: CookieParaGravar[]) {
          for (const { name, value } of lista) {
            request.cookies.set(name, value);
          }
          resposta = NextResponse.next({ request });
          for (const { name, value, options } of lista) {
            resposta.cookies.set(name, value, options);
          }
        },
      },
    });

    const { data } = await supabase.auth.getUser();
    return { resposta, autenticado: Boolean(data.user) };
  } catch {
    return { resposta, autenticado: false };
  }
}

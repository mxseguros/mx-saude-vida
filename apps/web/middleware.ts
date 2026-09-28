import { NextResponse, type NextRequest } from "next/server";
import { renovarSessao } from "@/lib/supabase/middleware";

/**
 * Guarda das rotas.
 *
 * Regra que este arquivo existe para cumprir: o middleware NAO pode lancar.
 * Um throw aqui devolve 500 em toda rota que passa pelo matcher, nao so
 * naquela que falhou — inclusive a tela de login, e ai ninguem consegue nem
 * entrar para consertar. Falha de auth vira
 * redirect, sempre, e ha um try/catch de ultimo recurso no fim.
 */

const ROTAS_PROTEGIDAS = ["/controle", "/clientes", "/configuracoes", "/portal"];

/** Para onde vai quem entrou sem destino declarado. */
const DESTINO_PADRAO = "/controle";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  try {
    const { resposta, autenticado } = await renovarSessao(request);

    const protegida = ROTAS_PROTEGIDAS.some(
      (rota) => pathname === rota || pathname.startsWith(`${rota}/`),
    );

    if (protegida && !autenticado) {
      // Guarda o caminho COM a query antes de limpar: sem isso, quem clicou
      // num link com filtro (/controle?status=corte) volta do login numa lista
      // sem filtro nenhum e tem que refazer o que ja tinha feito.
      const pretendido = `${pathname}${request.nextUrl.search}`;

      const destino = request.nextUrl.clone();
      destino.pathname = "/entrar";
      destino.search = "";
      destino.searchParams.set("destino", pretendido);
      return NextResponse.redirect(destino);
    }

    if (pathname === "/entrar" && autenticado) {
      const destino = request.nextUrl.clone();
      destino.pathname = DESTINO_PADRAO;
      destino.search = "";
      return NextResponse.redirect(destino);
    }

    return resposta;
  } catch {
    // Ultima linha de defesa. Se ate o tratamento falhou, a pessoa vai para o
    // login em vez de receber 500 — e o resto do sistema continua de pe.
    const destino = request.nextUrl.clone();
    destino.pathname = "/entrar";
    destino.search = "";
    destino.searchParams.set("erro", "sessao");
    return NextResponse.redirect(destino);
  }
}

export const config = {
  matcher: [
    // Tudo, menos estaticos e imagens.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2)$).*)",
  ],
};

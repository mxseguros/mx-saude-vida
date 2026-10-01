import { redirect } from "next/navigation";

import { Moldura } from "@/app/_admin/moldura";
import { situacaoDoAcesso, situacaoDoCliente } from "@/lib/supabase/servidor";

/**
 * A moldura do sistema, num lugar só.
 *
 * O layout do grupo resolve duas coisas: a sidebar é estável entre rotas (o
 * React a preserva porque só o `children` muda) e a decisão de acesso acontece
 * uma vez, e não em cada página.
 *
 * O grupo `(sistema)` não aparece na URL — `/controle` continua `/controle`.
 * Ele existe para separar quem usa a moldura da equipe de quem não usa:
 * `/entrar`, o portal do cliente e as telas de erro ficam de fora.
 *
 * Nada sob esta moldura pode ser gerado estaticamente: tudo depende de quem
 * está logada. A declaração é EXPLÍCITA porque o sinal automático não chega:
 * `situacaoDoAcesso` tem um `try/catch` em volta, que engole a exceção que o
 * Next usa para marcar a rota como dinâmica.
 */
export const dynamic = "force-dynamic";

export default async function LayoutDoSistema({
  children,
}: {
  children: React.ReactNode;
}) {
  const acesso = await situacaoDoAcesso();

  if (acesso.estado === "sem_sessao") {
    // O middleware já pega este caso e preserva o caminho pretendido; aqui é
    // defesa em profundidade, e por isso não tenta remontar o destino.
    redirect("/entrar");
  }

  if (acesso.estado === "sem_acesso") {
    // Pode ser gestor de CLIENTE que digitou /controle, ou colou um link que a
    // analista mandou. Ele tem sessão válida e lugar no sistema — só não é
    // aqui. Mandar para /sem-acesso diria que o acesso dele acabou, o que é
    // falso e gera ligação.
    const cliente = await situacaoDoCliente();
    if (cliente.estado === "ok") redirect("/portal");

    // NUNCA para /entrar: a sessão ainda é válida, o middleware devolveria a
    // pessoa para cá e o navegador acusaria "redirecionamentos demais".
    redirect("/sem-acesso");
  }

  if (acesso.estado === "indisponivel") {
    // Banco fora do ar não é falta de permissão. Mandar para o login seria
    // mentir sobre a causa e oferecer uma porta que também não abriria.
    throw new Error("banco indisponivel");
  }

  return <Moldura perfil={acesso.perfil}>{children}</Moldura>;
}

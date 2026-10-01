import { redirect } from "next/navigation";

import { situacaoDoAcesso, situacaoDoCliente } from "@/lib/supabase/servidor";

import { MolduraDoPortal } from "./_portal/moldura";

/**
 * A moldura do portal, e a decisão de acesso do SEGUNDO público.
 *
 * Espelha `(sistema)/layout.tsx` e troca a pergunta: aqui quem entra é
 * `client_users`, não `profiles`. Alguém da equipe que abrir `/portal` por
 * curiosidade volta ao Controle — ela não tem `client_id`, então não há nada
 * para mostrar, e uma tela vazia pareceria defeito.
 *
 * Nada aqui pode ser gerado estaticamente: tudo depende de quem está logado. A
 * declaração é EXPLÍCITA porque o sinal automático não chega — `situacaoDoCliente`
 * tem try/catch em volta, e ele engole a exceção que o Next usa para marcar a
 * rota como dinâmica.
 */
export const dynamic = "force-dynamic";

export default async function LayoutDoPortal({ children }: { children: React.ReactNode }) {
  const acesso = await situacaoDoCliente();

  if (acesso.estado === "sem_sessao") {
    // Defesa em profundidade: o middleware já pega este caso e preserva o
    // caminho pretendido, então aqui não se tenta remontar o destino.
    redirect("/entrar");
  }

  if (acesso.estado === "sem_acesso") {
    // Pode ser alguém da EQUIPE que abriu /portal. Não é falta de acesso: é
    // sala errada, e o conserto é levar a pessoa à sala dela.
    const equipe = await situacaoDoAcesso();
    if (equipe.estado === "ok") redirect("/controle");

    redirect("/sem-acesso");
  }

  if (acesso.estado === "indisponivel") {
    // Banco fora do ar não é falta de permissão. Mandar para o login seria
    // mentir sobre a causa e oferecer uma porta que também não abriria.
    throw new Error("banco indisponivel");
  }

  return <MolduraDoPortal cliente={acesso.cliente}>{children}</MolduraDoPortal>;
}

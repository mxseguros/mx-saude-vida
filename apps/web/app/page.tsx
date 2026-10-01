import { redirect } from "next/navigation";

import { publicoDaSessao } from "@/lib/supabase/servidor";

/**
 * A raiz não tem tela: ela DECIDE o público.
 *
 * Existe porque o sistema tem duas plateias na mesma porta. O middleware sabe
 * se há sessão, mas não quem é — descobrir isso custa uma consulta, e fazer
 * essa consulta no middleware a cobraria em TODA requisição, inclusive nas de
 * arquivo estático. Aqui ela acontece uma vez, no login e em quem digita o
 * domínio puro.
 *
 * Antes isto redirecionava direto para `/controle`, e um gestor de cliente
 * caía em `/sem-acesso` logo depois de acertar a senha: a tela dizia que o
 * acesso tinha sido encerrado quando ele nunca tinha entrado.
 */
export const dynamic = "force-dynamic";

export default async function Raiz() {
  const publico = await publicoDaSessao();

  // `indisponivel` vai para o Controle de propósito: lá a moldura tem o
  // tratamento de banco fora do ar, com a mensagem certa. Mandar para o login
  // seria mentir sobre a causa.
  if (publico === "cliente") redirect("/portal");
  if (publico === "nenhum") redirect("/sem-acesso");
  redirect("/controle");
}

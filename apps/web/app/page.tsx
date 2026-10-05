import { redirect } from "next/navigation";

/**
 * A raiz não tem tela.
 *
 * Houve um tempo em que ela DECIDIA o público: o sistema tinha duas plateias na
 * mesma porta, e descobrir qual delas custava uma consulta. Em 05/10 o portal
 * do cliente saiu — o gestor passa a receber um LINK, sem senha — e sobrou uma
 * plateia só. A decisão virou um redirecionamento.
 *
 * O middleware manda quem não tem sessão para o login antes de chegar aqui.
 */
export default function Raiz() {
  redirect("/controle");
}

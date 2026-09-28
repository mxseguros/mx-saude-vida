import { redirect } from "next/navigation";

/** A raiz não tem tela: quem chega aqui vai para o Controle (ou para o login, pelo middleware). */
export default function Raiz() {
  redirect("/controle");
}

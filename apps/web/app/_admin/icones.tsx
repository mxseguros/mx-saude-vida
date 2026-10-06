/**
 * Os ícones do menu.
 *
 * Existem porque a sidebar passou a ser retrátil: num trilho de 56px não cabe
 * "Assistências", e sem nada no lugar do rótulo o menu recolhido vira uma
 * coluna de quadrados iguais.
 *
 * Inline e não biblioteca: são seis desenhos de traço, e uma dependência de
 * ícones custaria mais bytes do que o sistema inteiro de primitivas. Todos com
 * `stroke="currentColor"`, então acompanham a cor do item — inclusive o estado
 * ativo — sem nenhuma regra de tema.
 *
 * `aria-hidden` sempre: o nome acessível vem do texto ao lado quando expandido,
 * e do `title`/`aria-label` do link quando recolhido. Ícone que se anuncia
 * duplicaria a leitura.
 */

export type NomeDoIcone =
  | "controle"
  | "lista"
  | "clientes"
  | "alertas"
  | "ajuda"
  | "configuracoes";

const TRACO = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const DESENHOS: Record<NomeDoIcone, React.ReactNode> = {
  // Calendário com marca: o Controle é o mês e as suas datas.
  controle: (
    <>
      <rect x="2.5" y="3.5" width="13" height="12" rx="2" {...TRACO} />
      <path d="M2.5 7.5h13M6 2v3M12 2v3M6.5 11.5l1.8 1.8 3.4-3.6" {...TRACO} />
    </>
  ),
  lista: (
    <>
      <path d="M6.2 4.3h9M6.2 9h9M6.2 13.7h9" {...TRACO} />
      <path d="M2.8 4.3h.01M2.8 9h.01M2.8 13.7h.01" {...TRACO} strokeWidth={2.2} />
    </>
  ),
  clientes: (
    <>
      <circle cx="7" cy="6.2" r="2.8" {...TRACO} />
      <path d="M2.4 15.1c0-2.4 2.1-4.3 4.6-4.3s4.6 1.9 4.6 4.3" {...TRACO} />
      <path d="M12.4 4.1a2.6 2.6 0 0 1 0 4.9M13.6 15.1c0-1.7-.5-2.9-1.3-3.8" {...TRACO} />
    </>
  ),
  // O sino dos alertas de prazo (v0.7).
  alertas: (
    <>
      <path d="M4.5 12.5V8a4.5 4.5 0 0 1 9 0v4.5l1.2 1.2H3.3z" {...TRACO} />
      <path d="M7.4 15.2a1.7 1.7 0 0 0 3.2 0" {...TRACO} />
    </>
  ),
  // Controles deslizantes, e nao engrenagem: a engrenagem desenhada a traco
  // em 16px vira um sol. Os deslizantes continuam legiveis nesse tamanho.
  configuracoes: (
    <>
      <path d="M2.6 4.6h12.8M2.6 9h12.8M2.6 13.4h12.8" {...TRACO} />
      <circle cx="6.2" cy="4.6" r="1.6" {...TRACO} />
      <circle cx="11.8" cy="9" r="1.6" {...TRACO} />
      <circle cx="7.4" cy="13.4" r="1.6" {...TRACO} />
    </>
  ),
  // Ajuda: o circulo com a interrogacao, que qualquer pessoa reconhece.
  ajuda: (
    <>
      <circle cx="8" cy="8" r="6.4" {...TRACO} />
      <path d="M6.1 6.3a1.9 1.9 0 1 1 2.8 1.7c-.6.3-.9.7-.9 1.3" {...TRACO} />
      <path d="M8 11.6h.01" {...TRACO} strokeWidth={2.2} />
    </>
  ),
};

export function Icone({
  nome,
  tamanho = 18,
}: {
  nome: NomeDoIcone;
  tamanho?: number;
}) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 18 18"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      {DESENHOS[nome]}
    </svg>
  );
}

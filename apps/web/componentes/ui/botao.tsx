import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Botao (§4.4). Altura 40px, 46px na landing. Raio 6px.
 *
 * O rotulo diz o que acontece ao clicar: "Enviar convite", nao "Confirmar".
 *
 * Duas formas, mesma aparencia: `Botao` para acao (submit, abrir modal) e
 * `LinkBotao` para navegacao. A separacao nao e estetica — `<Botao>` dentro de
 * `<Link>` produz `<button>` dentro de `<a>`, que e HTML invalido: o leitor de
 * tela anuncia dois controles aninhados e o Enter dispara comportamento
 * diferente conforme o navegador.
 */

type Variante = "primario" | "secundario" | "suave" | "whatsapp" | "perigo" | "texto";
type Tamanho = "normal" | "grande";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: Variante;
  tamanho?: Tamanho;
  children: ReactNode;
};

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-[6px] font-[600] " +
  "font-(family-name:--font-display) whitespace-nowrap transition-colors " +
  "disabled:opacity-50 disabled:pointer-events-none cursor-pointer";

const VARIANTES: Record<Variante, string> = {
  // No tema escuro --brand vira azul-claro e --on-brand vira navy: o par
  // continua legivel sem nenhuma regra especifica de tema.
  primario: "bg-brand text-on-brand hover:bg-brand-hover",
  secundario:
    "bg-transparent text-heading border border-line-strong hover:bg-surface-2",
  suave: "bg-accent-soft text-on-accent-soft hover:brightness-95",
  whatsapp: "bg-[#1F7A55] text-white hover:brightness-110",
  // Vermelho e o unico CTA fora da paleta MX, e so para o que nao se desfaz:
  // excluir de vez, recusar. Se aparecer em acao comum, deixa de ser sinal.
  perigo: "bg-bad text-white hover:brightness-110",
  texto: "bg-transparent text-muted hover:text-heading px-1",
};

const TAMANHOS: Record<Tamanho, string> = {
  // h-11 (44px) no celular: e o alvo de toque minimo. Acima do `sm` volta a
  // 40px, que e a altura do prototipo para mouse.
  normal: "h-11 px-4 text-[14px] sm:h-10",
  grande: "h-[46px] px-6 text-[15px]",
};

export function Botao({
  variante = "primario",
  tamanho = "normal",
  className = "",
  type = "button",
  children,
  ...resto
}: Props) {
  return (
    <button
      type={type}
      className={`${BASE} ${VARIANTES[variante]} ${TAMANHOS[tamanho]} ${className}`}
      {...resto}
    >
      {children}
    </button>
  );
}

/** Navegacao com aparencia de botao. Vira `<a>`, nao `<button>`. */
export function LinkBotao({
  href,
  variante = "primario",
  tamanho = "normal",
  className = "",
  children,
}: {
  href: string;
  variante?: Variante;
  tamanho?: Tamanho;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`${BASE} ${VARIANTES[variante]} ${TAMANHOS[tamanho]} ${className}`}
    >
      {children}
    </Link>
  );
}

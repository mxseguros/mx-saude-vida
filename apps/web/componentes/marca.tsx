import Image from "next/image";

/**
 * Marca MX.
 *
 * Dois modos, e a escolha entre eles não é estética — é sobre o fundo:
 *
 * `fixo`      para superfícies que são SEMPRE navy (hero da landing, sidebar
 *             do admin). Usa o PNG branco direto.
 *
 * `adaptavel` para superfícies que mudam com o tema (rodapé, tela de login).
 *             Aqui o PNG não serve: o lockup navy sumiria no tema escuro.
 *             A imagem vira MÁSCARA e a cor vem de `currentColor`, então o
 *             logo acompanha o texto ao redor em qualquer tema, sem precisar
 *             de duas cópias e de um seletor para trocar entre elas.
 *
 * O `alt` fica vazio de propósito quando o nome da MX já aparece em texto ao
 * lado: leitor de tela anunciaria a mesma coisa duas vezes.
 */

const PROPORCAO_LOCKUP = 806 / 135;
const PROPORCAO_MONOGRAMA = 549 / 209;

export function LockupMX({
  altura = 28,
  modo = "adaptavel",
  titulo,
  className = "",
}: {
  altura?: number;
  modo?: "fixo" | "adaptavel";
  /** Preenche o alt. Vazio quando o nome já está escrito ao lado. */
  titulo?: string;
  className?: string;
}) {
  const largura = Math.round(altura * PROPORCAO_LOCKUP);

  if (modo === "fixo") {
    return (
      <Image
        src="/mx-lockup-branco.png"
        alt={titulo ?? ""}
        width={largura}
        height={altura}
        priority
        className={className}
      />
    );
  }

  return (
    <span
      role={titulo ? "img" : undefined}
      aria-label={titulo || undefined}
      aria-hidden={titulo ? undefined : true}
      className={`inline-block bg-current ${className}`}
      style={{
        width: largura,
        height: altura,
        maskImage: "url(/mx-lockup-navy.png)",
        WebkitMaskImage: "url(/mx-lockup-navy.png)",
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
      }}
    />
  );
}

export function MonogramaMX({
  altura = 20,
  modo = "fixo",
  className = "",
}: {
  altura?: number;
  modo?: "fixo" | "adaptavel";
  className?: string;
}) {
  const largura = Math.round(altura * PROPORCAO_MONOGRAMA);

  if (modo === "fixo") {
    return (
      <Image
        src="/mx-monograma-branco.png"
        alt=""
        width={largura}
        height={altura}
        className={className}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`inline-block bg-current ${className}`}
      style={{
        width: largura,
        height: altura,
        maskImage: "url(/mx-monograma-navy.png)",
        WebkitMaskImage: "url(/mx-monograma-navy.png)",
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
      }}
    />
  );
}

/**
 * Selo circular "Corretora de seguros · desde 2002".
 *
 * Elemento de confiança no hero — NUNCA como logo principal. Por isso não
 * existe uma variante dele para o cabeçalho nem para a sidebar.
 */
export function SeloMX({
  tamanho = 88,
  className = "",
}: {
  tamanho?: number;
  className?: string;
}) {
  return (
    <Image
      src="/mx-selo-branco.png"
      alt="MX Corretora de seguros, desde 2002"
      width={tamanho}
      height={tamanho}
      className={className}
    />
  );
}

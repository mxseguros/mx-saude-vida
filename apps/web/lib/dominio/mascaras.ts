import { digitosDoTelefone } from "./telefone";
import { normalizarDocumento } from "./documento";

/**
 * Máscaras de digitação.
 *
 * Diferentes das funções de `telefone.ts` e `documento.ts`, que formatam um
 * valor COMPLETO para leitura. Estas rodam a cada tecla, com o campo pela
 * metade: `mascararTelefone("119")` precisa devolver `(11) 9`, não desistir
 * por não ter 10 dígitos.
 *
 * São conveniência, nunca a regra: quem decide o que entra no banco é o zod,
 * no servidor. Uma máscara que recusa o que a pessoa digitou é pior do que
 * máscara nenhuma — por isso elas APARAM (limitam caracteres e tamanho) e
 * nunca rejeitam; a mensagem de erro vem da validação, com o campo culpado.
 *
 * Puro, sem I/O.
 */

export type Mascara = (entrada: string) => string;

/**
 * "R$ 2.500,00", "2500,00" e "2500.5" viram numero; o que nao for numero vira
 * `null`, nunca zero — valor ilegivel e outra coisa que valor zero.
 */
export function valorParaNumero(texto: string): number | null {
  const limpo = texto.replace(/[^\d,.-]/g, "");
  if (!limpo || !/\d/.test(limpo)) return null;
  const temVirgula = limpo.includes(",");
  const normal = temVirgula ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  const numero = Number(normal);
  return Number.isFinite(numero) ? numero : null;
}

/* --------------------------------------------------------------------------
   Moeda
   -------------------------------------------------------------------------- */

/**
 * Os dois últimos dígitos são os centavos, sempre.
 *
 * Digitar "250000" mostra "R$ 2.500,00" — é como funciona a maquininha e o
 * internet banking, e é o que a analista espera ao digitar o valor do boleto.
 * Colar "R$ 2.500,00" de volta devolve o mesmo texto, então o campo é estável
 * quando recebe o valor que ele mesmo produziu.
 */
export const mascararMoeda: Mascara = (entrada) => {
  const digitos = entrada.replace(/\D/g, "").slice(0, 15);
  if (!digitos) return "";

  const centavos = digitos.padStart(3, "0");
  const inteiros = centavos.slice(0, -2).replace(/^0+(?=\d)/, "");
  const decimais = centavos.slice(-2);

  return `R$ ${inteiros.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${decimais}`;
};

/** Para exibir o que veio do banco: 2500 -> "R$ 2.500,00". */
export function formatarMoeda(valor: number | string | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "";
  const numero = typeof valor === "number" ? valor : valorParaNumero(String(valor));
  if (numero === null || !Number.isFinite(numero)) return "";

  const negativo = numero < 0;
  const centavos = Math.round(Math.abs(numero) * 100).toString();
  return (negativo ? "-" : "") + mascararMoeda(centavos);
}

/* --------------------------------------------------------------------------
   Telefone
   -------------------------------------------------------------------------- */

/**
 * Progressiva: "1", "(1", "(11) ", "(11) 98765-4321".
 *
 * O `+` na frente é preservado sem formatar — número estrangeiro existe na
 * base, e remontá-lo no formato daqui inventa um telefone que ninguém atende
 * (a mesma razão que `formatarTelefone` documenta).
 */
export const mascararTelefone: Mascara = (entrada) => {
  if (entrada.trim().startsWith("+")) {
    return "+" + entrada.replace(/[^\d\s]/g, "").slice(0, 20);
  }

  const d = digitosDoTelefone(entrada).slice(0, 11);
  if (!d) return "";
  if (d.length <= 2) return `(${d}`;

  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  // Até 10 dígitos o corte é depois do 4º; no 11º (celular) passa para o 5º.
  const corte = d.length <= 10 ? 4 : 5;

  if (resto.length <= corte) return `(${ddd}) ${resto}`;
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
};

/**
 * Telefone brasileiro utilizável: DDD de verdade e, no celular, o 9 na frente.
 *
 * 10 ou 11 dígitos. DDD abaixo de 11 não existe, e celular de 11 dígitos que
 * não começa com 9 é fixo digitado errado — os dois casos custam uma ligação
 * que não completa.
 */
export function telefoneValido(entrada: string): boolean {
  const d = digitosDoTelefone(entrada);
  if (d.length !== 10 && d.length !== 11) return false;

  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99) return false;

  if (d.length === 11 && d[2] !== "9") return false;
  return true;
}

/* --------------------------------------------------------------------------
   Documento, CEP, UF, ano, código
   -------------------------------------------------------------------------- */

/** Progressiva: CPF até 11 dígitos, CNPJ do 12º em diante. */
export const mascararDocumento: Mascara = (entrada) => {
  const d = normalizarDocumento(entrada).slice(0, 14);
  if (!d) return "";

  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
  }

  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,4})/, ".$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
};

export const mascararCep: Mascara = (entrada) => {
  const d = entrada.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
};

export function cepValido(entrada: string): boolean {
  return /^\d{8}$/.test(entrada.replace(/\D/g, ""));
}

/** Duas letras, maiúsculas. Digitar "sao paulo" no campo de UF é comum. */
export const mascararUf: Mascara = (entrada) =>
  entrada.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 2);

export const mascararAno: Mascara = (entrada) => entrada.replace(/\D/g, "").slice(0, 4);

/**
 * Número de apólice, de contrato e de boleto.
 *
 * Permissiva de propósito: cada seguradora numera do seu jeito, com ponto,
 * barra ou hífen, e recusar cadastro por causa de máscara é o pior efeito
 * possível. Só apara o que claramente não pertence e limita o tamanho.
 */
export const mascararCodigo: Mascara = (entrada) =>
  entrada
    .replace(/[^A-Za-z0-9 ./-]/g, "")
    .replace(/\s{2,}/g, " ")
    .slice(0, 40);

/* --------------------------------------------------------------------------
   E-mail
   -------------------------------------------------------------------------- */

/** A única validação de e-mail do projeto. Vive aqui; `cliente.ts` importa. */
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailValido(entrada: string): boolean {
  return EMAIL.test(entrada.trim());
}

/** Sem espaço e em minúsculas — o resto é com a pessoa. */
export const mascararEmail: Mascara = (entrada) =>
  entrada.replace(/\s/g, "").toLowerCase().slice(0, 254);

/**
 * Inteiro que aceita SINAL.
 *
 * "Dias até o prazo" é negativo quando o prazo já venceu. Uma máscara que só
 * deixasse dígito passar apagaria o menos enquanto a pessoa digita, e o valor
 * viraria o oposto do que ela quis escrever.
 */
export const mascararInteiro: Mascara = (entrada) => {
  const negativo = entrada.trimStart().startsWith("-");
  const digitos = entrada.replace(/\D/g, "").slice(0, 9);
  if (!digitos) return negativo ? "-" : "";
  return (negativo ? "-" : "") + digitos;
};

/**
 * Que dia é hoje, em São Paulo.
 *
 * Mora fora de `controle.ts` de propósito: lá tudo é puro e recebe "hoje" por
 * parâmetro, e é o que permite testar "dia 31 em fevereiro" sem esperar o
 * calendário. Aqui é o único lugar que lê o relógio.
 *
 * O fuso importa. Em UTC, às 21h de São Paulo já é o dia seguinte — um prazo
 * que vence hoje apareceria como vencido ontem, e a faixa do Controle acusaria
 * atraso que não existe.
 */

const FUSO = "America/Sao_Paulo";

/** `2026-09-28`. */
export function hojeSaoPaulo(agora: Date = new Date()): string {
  // `en-CA` formata como AAAA-MM-DD, que é o que o resto do sistema usa e o
  // que compara corretamente como texto.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}

/** `2026-09`, a competência corrente. */
export function competenciaDeHoje(agora: Date = new Date()): string {
  return hojeSaoPaulo(agora).slice(0, 7);
}

/**
 * A coleta por link: até quando o link vale, e em que estado ele está.
 *
 * Puro, como o resto do domínio: sem I/O, sem relógio, sem React. "Hoje" entra
 * por parâmetro em ISO (`AAAA-MM-DD`), já no fuso de São Paulo.
 *
 * As mesmas funções servem à rota pública (abrir ou recusar), à tela da
 * analista (dizer até quando vale) e ao cron (não cobrar quem não tem link).
 * As três não podem discordar sobre se um link está aberto.
 *
 * A comparação é de TEXTO, entre datas ISO, e não de instantes. Decidir prazo
 * com `Date` significaria decidir em UTC, onde às 21h de São Paulo já é
 * amanhã: um link que vale até hoje recusaria o gestor que abre depois do
 * jantar. O mesmo motivo de `hoje.ts` existir.
 */

import type { DatasDoMes } from "./controle";

/* --------------------------------------------------------------------------
   Até quando o link vale
   -------------------------------------------------------------------------- */

/**
 * O piso: um link nunca nasce valendo menos do que isto.
 *
 * Decisão de 05/10: o link vale **até o corte**. Mas a analista manda o link
 * quando se lembra, e às vezes isso é depois do corte — numa competência que
 * reabriu, num cliente que entrou no meio do mês, no primeiro mês de uso. Sem
 * o piso o link nasceria morto, e beco sem saída é defeito: o gestor clicaria
 * no WhatsApp para ler "este link expirou".
 */
export const DIAS_MINIMOS = 3;

/**
 * Até que DIA o link abre, inclusive.
 *
 * O corte é a data em que a seguradora fecha a movimentação do mês: informar
 * depois dele não entra na fatura, então é ali que o link deixa de servir.
 *
 * Sem corte — a apólice que não tem movimentação (saúde PME, global,
 * transporte) — vale até o boleto, que é a próxima data que existe. Esse
 * cliente não deveria receber link nenhum; se receber, melhor um prazo
 * razoável do que um erro.
 */
export function valeAte(datas: DatasDoMes, hoje: string): string {
  const limite = datas.corte ?? datas.boleto;
  const piso = somarDias(hoje, DIAS_MINIMOS);
  return limite > piso ? limite : piso;
}

/** `2026-09-28` + 3 = `2026-10-01`. Em UTC, que não tem horário de verão. */
function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/* --------------------------------------------------------------------------
   O token
   -------------------------------------------------------------------------- */

/**
 * 32 bytes. O token é a única credencial da rota pública, e ela é aberta na
 * internet: quem adivinhar um token lê a relação de vidas de uma empresa.
 * Com 256 bits de aleatoriedade, adivinhar não é uma estratégia.
 */
export const BYTES_DO_TOKEN = 32;

/**
 * Os bytes em `base64url`, que entra numa URL sem escape.
 *
 * Recebe os bytes em vez de sorteá-los para poder ser testada: quem chama é
 * que traz o `randomBytes` do servidor. `Math.random` não serve aqui e nunca
 * vai servir — é previsível por construção.
 */
export function tokenDeColeta(bytes: Uint8Array): string {
  if (bytes.length < BYTES_DO_TOKEN) {
    throw new Error(`token de coleta precisa de ${BYTES_DO_TOKEN} bytes, recebeu ${bytes.length}`);
  }
  let bruto = "";
  for (const b of bytes) bruto += String.fromCharCode(b);
  return btoa(bruto).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/**
 * Parece um token nosso?
 *
 * Serve para a rota pública recusar lixo ANTES de ir ao banco — um `/coleta/`
 * com 4 KB de texto na URL não merece uma consulta.
 */
export function pareceToken(valor: string): boolean {
  return /^[A-Za-z0-9_-]{40,64}$/.test(valor);
}

/* --------------------------------------------------------------------------
   O estado do link
   -------------------------------------------------------------------------- */

/**
 * Os quatro estados, e cada um tem tela própria na rota pública.
 *
 * `404` seco não serve a nenhum deles: o gestor que recebeu o link e esbarra
 * no prazo precisa saber a quem ligar, e quem já enviou precisa poder
 * conferir o que mandou. Dizer "não existe" para os dois é mentir para um e
 * assustar o outro.
 */
export type EstadoDoLink =
  /** Abre o formulário. */
  | "aberto"
  /** Já enviou, e pode rever ou corrigir — o link continua dele. */
  | "enviado"
  /** Passou do corte. A tela diz com quem falar. */
  | "expirado"
  /** Token que não casa com mês nenhum, ou mês sem link gerado. */
  | "invalido";

/** O que a rota pública precisa saber do mês, e nada além. */
export type MesDaColeta = {
  /** Nulo quando a analista nunca gerou o link. */
  token: string | null;
  /** O dia, inclusive, até o qual abre. */
  valeAte: string | null;
  /** Quando o gestor enviou. Nulo = ainda não enviou. */
  recebidoEm: string | null;
};

/**
 * Enviado VENCE expirado, de propósito.
 *
 * Decisão de 05/10: o gestor pode mudar o que informou depois de enviar, e a
 * analista recebe um alerta. Fechar o link no corte para quem JÁ enviou
 * tiraria dele a única cópia do que mandou — e ele não tem conta para
 * consultar em outro lugar. Quem não enviou nada até o corte não tem o que
 * rever, e para esse o prazo vale.
 */
export function estadoDoLink(mes: MesDaColeta | null, hoje: string): EstadoDoLink {
  if (!mes || !mes.token || !mes.valeAte) return "invalido";
  if (mes.recebidoEm) return "enviado";
  return hoje <= mes.valeAte ? "aberto" : "expirado";
}

/** Dias que faltam para fechar. Negativo quando já fechou. */
export function diasParaFechar(valeAte: string, hoje: string): number {
  const ms = Date.parse(`${valeAte}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/* --------------------------------------------------------------------------
   As pessoas
   -------------------------------------------------------------------------- */

export type TipoDeMovimento = "entrada" | "saida";

export type QuemDigitou = "gestor" | "equipe";

export type Movimento = {
  tipo: TipoDeMovimento;
  nome: string;
  /** CPF, só dígitos. Nulo quando o gestor não tinha à mão. */
  documento: string | null;
  porQuem: QuemDigitou;
};

export const ROTULO_MOVIMENTO: Record<TipoDeMovimento, string> = {
  entrada: "Quem entrou",
  saida: "Quem saiu",
};

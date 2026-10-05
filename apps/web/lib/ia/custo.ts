/**
 * Custo das chamadas de IA.
 *
 * O planejamento estima R$ 0,05 a 0,20 por ticket. Sem medir, essa estimativa
 * nunca vira fato — e o jeito de descobrir que ela estourou não pode ser a
 * fatura no fim do mês.
 *
 * Puro: recebe os tokens que a resposta declarou e devolve o custo. Sem I/O,
 * sem relógio.
 */

/** Preço por milhão de tokens, em dólar. Fonte: tabela pública da Anthropic. */
export const PRECO_POR_MILHAO = {
  "claude-opus-5": { entrada: 5, saida: 25 },
  "claude-sonnet-5": { entrada: 2, saida: 10 },
  "claude-haiku-4-5-20251001": { entrada: 1, saida: 5 },
} as const;

export type ModeloConhecido = keyof typeof PRECO_POR_MILHAO;

export function modeloConhecido(modelo: string): modelo is ModeloConhecido {
  return modelo in PRECO_POR_MILHAO;
}

export type Uso = {
  entrada: number;
  saida: number;
  /** Tokens lidos do cache: custam ~10% do preço de entrada. */
  cacheLido?: number;
  /** Tokens gravados no cache: custam ~25% a mais que a entrada. */
  cacheGravado?: number;
};

/**
 * Custo em dólar. Devolve `null` para modelo que não está na tabela — melhor
 * registrar "não sei" do que gravar um número inventado num campo que alguém
 * vai somar depois.
 */
export function custoEmDolar(modelo: string, uso: Uso): number | null {
  if (!modeloConhecido(modelo)) return null;

  const preco = PRECO_POR_MILHAO[modelo];
  const milhao = 1_000_000;

  const entrada = (uso.entrada / milhao) * preco.entrada;
  const saida = (uso.saida / milhao) * preco.saida;
  const cacheLido = ((uso.cacheLido ?? 0) / milhao) * preco.entrada * 0.1;
  const cacheGravado = ((uso.cacheGravado ?? 0) / milhao) * preco.entrada * 1.25;

  return entrada + saida + cacheLido + cacheGravado;
}

/**
 * Conversão para real.
 *
 * A cotação é parâmetro, não constante embutida: câmbio chumbado no código
 * envelhece em silêncio e o custo registrado passa a mentir sem ninguém notar.
 * Vive em `AI_USD_BRL`, com um padrão conservador.
 */
export function custoEmReal(
  modelo: string,
  uso: Uso,
  cotacao: number,
): number | null {
  const dolar = custoEmDolar(modelo, uso);
  return dolar === null ? null : dolar * cotacao;
}

/*
 * NAO EXISTE teto por TICKET, e a ausencia e deliberada.
 *
 * Ele existiu aqui, com teste, e nunca foi chamado — porque nao HA onde
 * chamar: os dois agentes rodam antes de o ticket existir. A apolice e lida
 * durante o preenchimento e a triagem tambem; o Vigia nem ticket tem. Todo
 * `ai_runs.ticket_id` e nulo.
 *
 * Um teto que nao tem a que se amarrar nao protege nada e ainda aparece no
 * plano como controle existente. Foi removido em favor do teto diario por
 * pessoa, que cobre os mesmos modos de falhar caro: o laco de reler, a apolice
 * enorme, alguem testando.
 */

/**
 * Teto de gasto DIÁRIO por pessoa.
 *
 * O teto por ticket não cobre o caso mais comum: a leitura da apólice acontece
 * antes de o ticket existir, então não há a que amarrá-lo. Este cobre — e cobre
 * também o laço de quem clica "reler" dez vezes, que é o modo de falhar caro
 * que ninguém percebe acontecendo.
 *
 * R$ 6,00 é folgado para o uso normal: o planejamento estima R$ 0,05 a 0,20 por
 * ticket, e ninguém abre trinta sinistros por dia. Quem bate nele está num laço
 * ou está testando — os dois casos merecem parar e aparecer.
 */
export const TETO_DIARIO_POR_PESSOA_BRL = 6.0;

export function excedeuTetoDiario(
  gastoDeHoje: number,
  teto = TETO_DIARIO_POR_PESSOA_BRL,
) {
  return gastoDeHoje >= teto;
}

/**
 * Por quantos dias a extração de um PDF continua valendo.
 *
 * O documento não muda — o hash é do conteúdo. O que muda é o modelo e o
 * prompt, e uma extração de três meses atrás foi produzida por uma versão que
 * talvez não exista mais. Trinta dias cobre com folga o reenvio do mesmo
 * arquivo (que acontece em minutos) sem carregar resposta de outra era.
 */
export const DIAS_DE_CACHE = 30;

export function cacheAindaVale(
  criadoEm: string | Date,
  agora: Date = new Date(),
  dias = DIAS_DE_CACHE,
): boolean {
  const quando = criadoEm instanceof Date ? criadoEm : new Date(criadoEm);
  if (Number.isNaN(quando.getTime())) return false;

  // Data no futuro é relógio torto em algum lugar. Não confiar é mais seguro
  // do que estender a validade por acidente.
  const idadeEmDias = (agora.getTime() - quando.getTime()) / 86_400_000;
  if (idadeEmDias < 0) return false;

  return idadeEmDias <= dias;
}

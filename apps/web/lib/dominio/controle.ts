/**
 * O Controle mensal: os passos do mês, as quatro datas e o que conta como prazo.
 *
 * Puro: sem I/O, sem React, sem relógio. "Hoje" entra por parâmetro, em ISO
 * (`AAAA-MM-DD`), já no fuso de São Paulo — quem chama é que sabe que dia é.
 * É o que permite testar "dia 31 em fevereiro" e "vencimento no mês seguinte"
 * sem esperar o calendário.
 *
 * As mesmas funções servem à tela (cor da data, próximo passo) e ao cron
 * (avanço automático, mensagens do dia): as duas pontas não podem discordar
 * sobre em que passo um cliente está.
 */

/* --------------------------------------------------------------------------
   Passos
   -------------------------------------------------------------------------- */

export type Passo =
  | "informar"
  | "planilha_recebida"
  | "conferida"
  | "corte"
  | "boleto"
  | "vencimento"
  | "concluida";

/** Na ordem em que o mês anda. */
export const PASSOS: readonly Passo[] = [
  "informar",
  "planilha_recebida",
  "conferida",
  "corte",
  "boleto",
  "vencimento",
  "concluida",
] as const;

export const ROTULO_PASSO: Record<Passo, string> = {
  informar: "Informar até",
  planilha_recebida: "Planilha recebida",
  conferida: "Conferida",
  corte: "Corte",
  boleto: "Boleto",
  vencimento: "Vencimento",
  concluida: "Concluída",
};

/* --------------------------------------------------------------------------
   Datas do mês
   -------------------------------------------------------------------------- */

/**
 * As Regras do mês, como ficam no cadastro do cliente: dia do mês, de 1 a 31.
 *
 * `informarDia` e `corteDia` são nulos para a apólice que não tem movimentação
 * (saúde PME, global, transporte): ali o mês começa direto no boleto.
 */
export type RegrasDoMes = {
  informarDia: number | null;
  corteDia: number | null;
  boletoDia: number;
  vencimentoDia: number;
};

/** As quatro datas de uma competência, em ISO. */
export type DatasDoMes = {
  informar: string | null;
  corte: string | null;
  boleto: string;
  vencimento: string;
};

export type ChaveDeData = keyof DatasDoMes;

/** Na ordem das colunas do Controle. */
export const CHAVES_DE_DATA: readonly ChaveDeData[] = ["informar", "corte", "boleto", "vencimento"] as const;

export const ROTULO_DATA: Record<ChaveDeData, string> = {
  informar: "Informar até",
  corte: "Corte",
  boleto: "Boleto",
  vencimento: "Vencimento",
};

const COMPETENCIA = /^(\d{4})-(\d{2})$/;

function ultimoDia(ano: number, mes: number): number {
  // Dia 0 do mês seguinte é o último deste. `mes` aqui é 1–12.
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

function iso(ano: number, mes: number, dia: number): string {
  return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Dia 31 em mês de 30 vira 30; dia 30 em fevereiro vira 28 ou 29. */
function noMes(ano: number, mes: number, dia: number): string {
  return iso(ano, mes, Math.min(Math.max(dia, 1), ultimoDia(ano, mes)));
}

function mesSeguinte(ano: number, mes: number): [number, number] {
  return mes === 12 ? [ano + 1, 1] : [ano, mes + 1];
}

/**
 * As quatro datas de uma competência.
 *
 * As datas andam em ordem: informar ≤ corte ≤ boleto ≤ vencimento. Quando o
 * dia cadastrado é MENOR que o da data anterior, ele pertence ao mês seguinte
 * — é o caso comum de "corte dia 25, vencimento dia 10". Sem isso o sistema
 * avisaria do vencimento antes de o boleto existir.
 *
 * Devolve `null` para competência malformada: quem chama decide o que fazer.
 */
export function datasDaCompetencia(competencia: string, regras: RegrasDoMes): DatasDoMes | null {
  const partes = COMPETENCIA.exec(competencia);
  if (!partes) return null;
  const ano = Number(partes[1]);
  const mes = Number(partes[2]);
  if (mes < 1 || mes > 12) return null;

  let cursor: [number, number] = [ano, mes];
  let anterior: string | null = null;

  const proxima = (dia: number | null): string | null => {
    if (dia === null) return null;
    let data = noMes(cursor[0], cursor[1], dia);
    if (anterior !== null && data < anterior) {
      cursor = mesSeguinte(cursor[0], cursor[1]);
      data = noMes(cursor[0], cursor[1], dia);
    }
    anterior = data;
    return data;
  };

  const informar = proxima(regras.informarDia);
  const corte = proxima(regras.corteDia);
  const boleto = proxima(regras.boletoDia) as string;
  const vencimento = proxima(regras.vencimentoDia) as string;

  return { informar, corte, boleto, vencimento };
}

/** O passo em que o mês de um cliente nasce. */
export function passoInicial(regras: RegrasDoMes): Passo {
  return regras.informarDia === null && regras.corteDia === null ? "boleto" : "informar";
}

/* --------------------------------------------------------------------------
   Qual data conta em cada passo
   -------------------------------------------------------------------------- */

/**
 * A data "do momento" de um passo — a que fica colorida no Controle.
 *
 * Planilha recebida ainda olha para "informar" (a conferência precisa
 * acontecer antes do corte, mas o prazo que o cliente tinha era aquele);
 * conferida olha para o corte, que é o próximo marco.
 */
const DATA_DO_PASSO: Record<Passo, ChaveDeData | null> = {
  informar: "informar",
  planilha_recebida: "corte",
  conferida: "corte",
  corte: "boleto",
  boleto: "vencimento",
  vencimento: "vencimento",
  concluida: null,
};

export function dataEmFoco(passo: Passo): ChaveDeData | null {
  return DATA_DO_PASSO[passo];
}

export type SituacaoDoPrazo = "vencido" | "hoje" | "perto" | "no_prazo";

/** Quantos dias antes o prazo começa a chamar atenção. */
export const DIAS_DE_AVISO = 3;

function diasEntre(deIso: string, ateIso: string): number {
  const de = Date.parse(`${deIso}T00:00:00Z`);
  const ate = Date.parse(`${ateIso}T00:00:00Z`);
  return Math.round((ate - de) / 86_400_000);
}

export function situacaoDoPrazo(data: string, hoje: string): SituacaoDoPrazo {
  const faltam = diasEntre(hoje, data);
  if (faltam < 0) return "vencido";
  if (faltam === 0) return "hoje";
  if (faltam <= DIAS_DE_AVISO) return "perto";
  return "no_prazo";
}

/** Como cada uma das quatro datas aparece na linha do Controle. */
export type AparenciaDaData = "sem_data" | "cumprida" | "futura" | SituacaoDoPrazo;

/**
 * A aparência de uma data, dado o passo do mês.
 *
 * Só a data em foco ganha cor de prazo. As anteriores saem riscadas
 * (cumpridas) e as seguintes em cinza (futuras): quatro datas coloridas ao
 * mesmo tempo não dizem onde o mês está.
 */
export function aparenciaDaData(
  chave: ChaveDeData,
  passo: Passo,
  datas: DatasDoMes,
  hoje: string,
): AparenciaDaData {
  const data = datas[chave];
  if (data === null) return "sem_data";

  const foco = dataEmFoco(passo);
  if (foco === null) return "cumprida";

  const posicao = CHAVES_DE_DATA.indexOf(chave);
  const posicaoDoFoco = CHAVES_DE_DATA.indexOf(foco);
  if (posicao < posicaoDoFoco) return "cumprida";
  if (posicao > posicaoDoFoco) return "futura";
  return situacaoDoPrazo(data, hoje);
}

/* --------------------------------------------------------------------------
   Transições
   -------------------------------------------------------------------------- */

export type Acao =
  | "receber_planilha"
  | "sem_movimentacao"
  | "conferir"
  | "pedir_correcao"
  | "anexar_boleto"
  | "marcar_pago";

/**
 * De onde cada ação pode partir, e para onde leva.
 *
 * Lista FECHADA: o que não está aqui não acontece. A rota consulta esta
 * tabela antes de gravar, e o banco registra o evento — passo que muda sem
 * passar por aqui é passo que ninguém sabe explicar depois.
 */
const TRANSICOES: Record<Acao, { de: readonly Passo[]; para: Passo }> = {
  receber_planilha: { de: ["informar"], para: "planilha_recebida" },
  // A analista confirma com o cliente que o mês não mudou: não há planilha a conferir.
  sem_movimentacao: { de: ["informar", "planilha_recebida"], para: "conferida" },
  conferir: { de: ["planilha_recebida"], para: "conferida" },
  pedir_correcao: { de: ["planilha_recebida"], para: "informar" },
  anexar_boleto: { de: ["conferida", "corte", "boleto"], para: "boleto" },
  marcar_pago: { de: ["boleto", "vencimento"], para: "concluida" },
};

export function podeAgir(passo: Passo, acao: Acao): boolean {
  return TRANSICOES[acao].de.includes(passo);
}

/** O passo depois da ação, ou `null` quando ela não cabe no passo atual. */
export function aplicarAcao(passo: Passo, acao: Acao): Passo | null {
  return podeAgir(passo, acao) ? TRANSICOES[acao].para : null;
}

/**
 * O avanço que o calendário faz sozinho, no cron de cada manhã.
 *
 *   conferida → corte       quando o dia do corte chega;
 *   boleto    → vencimento  três dias antes de vencer.
 *
 * Devolve o MESMO passo quando não há o que avançar. Nunca pula etapa que
 * depende de gente: planilha que não chegou continua em "informar", por mais
 * que o corte tenha passado — é esse atraso que a tela precisa mostrar.
 */
export function avancoAutomatico(
  passo: Passo,
  datas: DatasDoMes,
  hoje: string,
  acompanhaPagamento = true,
): Passo {
  if (passo === "conferida" && datas.corte !== null && hoje >= datas.corte) return "corte";

  // Seguradora que cobra direto: o mes FECHA no boleto. Esperar um vencimento
  // que ninguem vai conferir deixaria 39 clientes parados em "boleto" para
  // sempre, enchendo a fila da analista de linha que nao pede nada.
  if (passo === "boleto" && !acompanhaPagamento) return "concluida";

  if (passo === "boleto" && diasEntre(hoje, datas.vencimento) <= DIAS_DE_AVISO) return "vencimento";
  return passo;
}

/* --------------------------------------------------------------------------
   Mensagens e próximo passo
   -------------------------------------------------------------------------- */

export type ModeloDeMensagem = "informar" | "corte" | "boleto" | "vencimento" | "correcao";

/** A mensagem que "Enviar mensagem" dispara em cada passo. */
const MENSAGEM_DO_PASSO: Record<Passo, ModeloDeMensagem | null> = {
  informar: "informar",
  planilha_recebida: null,
  conferida: null,
  corte: "corte",
  boleto: "boleto",
  vencimento: "vencimento",
  concluida: null,
};

export function mensagemDoPasso(passo: Passo): ModeloDeMensagem | null {
  return MENSAGEM_DO_PASSO[passo];
}

/**
 * A mensagem que o CRON deve mandar hoje, ou `null`.
 *
 * Três diferenças em relação a `mensagemDoPasso`, e cada uma custou um erro
 * para aparecer:
 *
 * 1. **O boleto não sai daqui.** Ele depende do arquivo que a analista anexa,
 *    não de data: avisar "seu boleto está disponível" sem boleto nenhum é
 *    pior que não avisar.
 * 2. **A comparação é `>=`, não `===`.** Cron que não rodou num dia — deploy,
 *    janela de manutenção, fuso — mandaria a mensagem nunca, em vez de mandar
 *    no dia seguinte. Atrasado é recuperável; perdido não é.
 * 3. **Não confere se já mandou.** Isso é do banco, por `(control_id, kind)`:
 *    a decisão "o que cabe hoje" é de calendário e fica aqui, pura; a decisão
 *    "isso já saiu" depende do que aconteceu e fica lá.
 * 4. **Cliente que paga direto na seguradora não recebe aviso de vencimento.**
 *    A MX não controla aquela data, e avisar sobre ela faz o cliente ligar para
 *    perguntar de onde veio o número.
 */
export function mensagemDevida(
  passo: Passo,
  datas: DatasDoMes,
  hoje: string,
  acompanhaPagamento = true,
): ModeloDeMensagem | null {
  // Aviso de vencimento a quem paga direto na seguradora e mensagem sobre uma
  // data que a MX nao controla — e o cliente liga para perguntar de onde veio.
  if (!acompanhaPagamento && (passo === "vencimento" || passo === "boleto")) return null;

  if (passo === "informar") {
    return datas.informar !== null && hoje >= datas.informar ? "informar" : null;
  }
  if (passo === "corte") {
    return datas.corte !== null && hoje >= datas.corte ? "corte" : null;
  }
  // O passo só vira `vencimento` pelo avanço automático, que já conferiu a
  // data: chegar aqui é a própria condição.
  if (passo === "vencimento") return "vencimento";
  return null;
}

export type ProximoPasso =
  | { tipo: "mensagem"; modelo: ModeloDeMensagem; rotulo: string }
  | { tipo: "conferir"; rotulo: string }
  | { tipo: "anexar_boleto"; rotulo: string }
  | { tipo: "marcar_pago"; rotulo: string }
  | { tipo: "nenhum" };

/**
 * O botão da coluna "Próximo passo".
 *
 * Em `vencimento` a ação é MARCAR PAGO, e não mandar mensagem: o aviso de
 * vencimento já saiu pelo cron três dias antes, e o que a etapa espera é a
 * confirmação de que o dinheiro entrou. Oferecer "Enviar mensagem" aqui faria a
 * analista mandar o mesmo aviso duas vezes para cobrar o que talvez já esteja
 * pago.
 */
export function proximoPasso(passo: Passo): ProximoPasso {
  if (passo === "planilha_recebida") return { tipo: "conferir", rotulo: "Conferir planilha" };
  if (passo === "conferida" || passo === "corte") {
    return { tipo: "anexar_boleto", rotulo: "Anexar boleto" };
  }
  if (passo === "vencimento") return { tipo: "marcar_pago", rotulo: "Marcar pago" };

  const modelo = mensagemDoPasso(passo);
  if (modelo) return { tipo: "mensagem", modelo, rotulo: "Enviar mensagem" };
  return { tipo: "nenhum" };
}

/* --------------------------------------------------------------------------
   Contadores da faixa do Controle
   -------------------------------------------------------------------------- */

export type LinhaParaContar = { passo: Passo; datas: DatasDoMes };

export type Contadores = { vencidos: number; hoje: number; perto: number; paraConferir: number };

export function contarPrazos(linhas: readonly LinhaParaContar[], hoje: string): Contadores {
  const total: Contadores = { vencidos: 0, hoje: 0, perto: 0, paraConferir: 0 };

  for (const linha of linhas) {
    if (linha.passo === "planilha_recebida") total.paraConferir += 1;

    const foco = dataEmFoco(linha.passo);
    const data = foco ? linha.datas[foco] : null;
    if (!data) continue;

    const situacao = situacaoDoPrazo(data, hoje);
    if (situacao === "vencido") total.vencidos += 1;
    else if (situacao === "hoje") total.hoje += 1;
    else if (situacao === "perto") total.perto += 1;
  }

  return total;
}

/* --------------------------------------------------------------------------
   Competência
   -------------------------------------------------------------------------- */

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
] as const;

/** `2026-09` → `setembro`. Competência malformada devolve string vazia. */
export function nomeDoMes(competencia: string): string {
  const partes = COMPETENCIA.exec(competencia);
  if (!partes) return "";
  return MESES[Number(partes[2]) - 1] ?? "";
}

/** `2026-09` → `Setembro/2026`. */
export function rotuloDaCompetencia(competencia: string): string {
  const partes = COMPETENCIA.exec(competencia);
  const mes = nomeDoMes(competencia);
  if (!partes || !mes) return competencia;
  return `${mes.charAt(0).toUpperCase()}${mes.slice(1)}/${partes[1]}`;
}

/** A competência de um dia: `2026-09-22` → `2026-09`. */
export function competenciaDe(dia: string): string {
  return dia.slice(0, 7);
}

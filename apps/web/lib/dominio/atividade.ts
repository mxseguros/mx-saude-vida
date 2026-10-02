import { CHAVES_DE_DATA, PASSOS, situacaoDoPrazo, type ChaveDeData, type DatasDoMes, type Passo } from "./controle";

/**
 * As ATIVIDADES do mês — o que alimenta as vistas Mês e Semana.
 *
 * A Lista responde "como está cada cliente". A agenda responde outra pergunta:
 * **o que eu tenho para fazer no dia 10?** São os mesmos dados virados de lado:
 * em vez de uma linha por cliente com quatro datas, uma atividade por data.
 *
 * **Atividade é DERIVADA, não guardada.** O estado sai do passo que o mês já
 * registra, cruzado com a data e com "hoje". Uma tabela de atividades seria um
 * segundo lugar que pode divergir do passo — e divergir aqui significa a
 * analista vendo "feita" numa coisa que não aconteceu.
 *
 * Puro, com "hoje" por parâmetro, como o resto do domínio.
 */

/** Uma por data do mês. É a lista do protótipo v0.8. */
export type TipoDeAtividade = "informar" | "corte" | "boleto" | "vencimento";

export const TIPOS_DE_ATIVIDADE: readonly TipoDeAtividade[] = [
  "informar",
  "corte",
  "boleto",
  "vencimento",
] as const;

export const ROTULO_ATIVIDADE: Record<TipoDeAtividade, string> = {
  informar: "Informar até",
  corte: "Corte",
  boleto: "Boleto",
  vencimento: "Vencimento",
};

/** O rótulo curto, para o contador dentro da célula do calendário. */
export const CURTO_ATIVIDADE: Record<TipoDeAtividade, string> = {
  informar: "informar",
  corte: "corte",
  boleto: "boleto",
  vencimento: "vencer",
};

/** O que a analista faz nesta atividade. */
export const ACAO_DA_ATIVIDADE: Record<TipoDeAtividade, string> = {
  informar: "Enviar mensagem",
  corte: "Enviar mensagem",
  boleto: "Anexar boleto",
  vencimento: "Marcar pago",
};

export type EstadoDaAtividade = "feita" | "pendente" | "atrasada";

/**
 * O passo que CONCLUI cada atividade.
 *
 * A atividade é o TRABALHO, e ela está feita quando o mês alcançou o passo que
 * resulta daquele trabalho:
 *
 * | atividade   | o trabalho                       | feita quando o mês chega em |
 * |-------------|----------------------------------|-----------------------------|
 * | informar    | conseguir a planilha do cliente  | planilha_recebida           |
 * | corte       | conferir e mandar à seguradora   | corte                       |
 * | boleto      | anexar o boleto                  | boleto                      |
 * | vencimento  | confirmar que o cliente pagou    | concluida                   |
 *
 * Ler assim — e não "o passo com o mesmo nome" — é o que faz a conta fechar:
 * o passo `boleto` significa que o boleto JÁ foi anexado, então a atividade
 * "anexar boleto" está cumprida ali, não pendente.
 */
const CONCLUI: Record<TipoDeAtividade, Passo> = {
  informar: "planilha_recebida",
  corte: "corte",
  boleto: "boleto",
  vencimento: "concluida",
};

/** Qual data do mês cada atividade usa. */
const DATA_DA_ATIVIDADE: Record<TipoDeAtividade, ChaveDeData> = {
  informar: "informar",
  corte: "corte",
  boleto: "boleto",
  vencimento: "vencimento",
};

function ordem(passo: Passo): number {
  return PASSOS.indexOf(passo);
}

export type Atividade = {
  tipo: TipoDeAtividade;
  /** `AAAA-MM-DD`. */
  dia: string;
  estado: EstadoDaAtividade;
  /** O que a analista precisa reconhecer na lista. */
  controleId: string;
  cliente: string;
  seguradora: string | null;
  analista: string | null;
  /** O passo em que o mês está, para a tela saber qual botão oferecer. */
  passo: Passo;
};

export type MesParaAgenda = {
  id: string;
  cliente: string;
  seguradora: string | null;
  analista: string | null;
  passo: Passo;
  datas: DatasDoMes;
  /** `false` = a seguradora cobra direto: não há vencimento a controlar. */
  acompanhaPagamento: boolean;
};

/**
 * As atividades de um mês.
 *
 * Data nula não gera atividade: apólice sem movimentação de vidas não tem
 * "informar até" nem "corte", e inventar uma linha vazia na agenda faria a
 * analista procurar um trabalho que não existe.
 */
export function atividadesDoMes(mes: MesParaAgenda, hoje: string): Atividade[] {
  const feitas = ordem(mes.passo);
  const saida: Atividade[] = [];

  for (const tipo of TIPOS_DE_ATIVIDADE) {
    // Cliente que paga direto na seguradora não tem vencimento a acompanhar.
    if (tipo === "vencimento" && !mes.acompanhaPagamento) continue;

    const dia = mes.datas[DATA_DA_ATIVIDADE[tipo]];
    if (dia === null) continue;

    const cumprida = feitas >= ordem(CONCLUI[tipo]);
    const situacao = situacaoDoPrazo(dia, hoje);

    const estado: EstadoDaAtividade = cumprida
      ? "feita"
      : situacao === "vencido"
        ? "atrasada"
        : "pendente";

    saida.push({
      tipo,
      dia,
      estado,
      controleId: mes.id,
      cliente: mes.cliente,
      seguradora: mes.seguradora,
      analista: mes.analista,
      passo: mes.passo,
    });
  }

  return saida;
}

/**
 * A agenda inteira, ordenada por dia e, dentro do dia, pela ordem do mês.
 *
 * A ordem dentro do dia é a das DATAS, não alfabética: num mesmo dia podem
 * cair o corte de um cliente e o boleto de outro, e ver primeiro o que vem
 * antes no ciclo é como a analista pensa.
 */
export function montarAgenda(meses: readonly MesParaAgenda[], hoje: string): Atividade[] {
  const todas = meses.flatMap((mes) => atividadesDoMes(mes, hoje));

  return todas.sort((a, b) => {
    if (a.dia !== b.dia) return a.dia.localeCompare(b.dia);

    const porTipo = TIPOS_DE_ATIVIDADE.indexOf(a.tipo) - TIPOS_DE_ATIVIDADE.indexOf(b.tipo);
    if (porTipo !== 0) return porTipo;

    // Desempate pelo nome, para a ordem não dançar entre dois carregamentos.
    return a.cliente.localeCompare(b.cliente, "pt-BR");
  });
}

/* --------------------------------------------------------------------------
   O que cada vista precisa
   -------------------------------------------------------------------------- */

export type DiaDaAgenda = {
  /** `AAAA-MM-DD`. */
  dia: string;
  /** Quantas faltam, por tipo. Só o que falta — feito não é trabalho. */
  pendentes: Partial<Record<TipoDeAtividade, number>>;
  /** Quantas já estão feitas, para o dia não parecer vazio. */
  feitas: number;
  /** `true` quando há atividade atrasada: o dia ganha a marca. */
  temAtrasada: boolean;
  total: number;
};

/**
 * Agrupa por dia, para a grade do mês.
 *
 * Os contadores mostram só o que FALTA. Um dia com dez coisas feitas e nenhuma
 * pendente é um dia resolvido, e enchê-lo de números faria a analista conferir
 * dez vezes o que já estava pronto.
 */
export function porDia(atividades: readonly Atividade[]): Map<string, DiaDaAgenda> {
  const mapa = new Map<string, DiaDaAgenda>();

  for (const atividade of atividades) {
    const atual =
      mapa.get(atividade.dia) ??
      ({ dia: atividade.dia, pendentes: {}, feitas: 0, temAtrasada: false, total: 0 } satisfies DiaDaAgenda);

    atual.total += 1;

    if (atividade.estado === "feita") {
      atual.feitas += 1;
    } else {
      atual.pendentes[atividade.tipo] = (atual.pendentes[atividade.tipo] ?? 0) + 1;
      if (atividade.estado === "atrasada") atual.temAtrasada = true;
    }

    mapa.set(atividade.dia, atual);
  }

  return mapa;
}

/**
 * O que o painel lateral mostra quando nenhum dia foi escolhido.
 *
 * Atrasadas de qualquer dia, mais as de hoje. É a primeira coisa que a analista
 * precisa ver ao abrir a agenda — e não o dia 1 do mês, que é onde um
 * calendário começaria.
 */
export function pendenciasDeAgora(atividades: readonly Atividade[], hoje: string): Atividade[] {
  return atividades.filter((a) => a.estado === "atrasada" || (a.dia === hoje && a.estado !== "feita"));
}

/** Os sete dias da semana que contém `dia`, de segunda a domingo. */
export function semanaDe(dia: string): string[] {
  const data = new Date(`${dia}T00:00:00Z`);
  // `getUTCDay()` devolve 0 para domingo; aqui a semana começa na segunda.
  const diaDaSemana = (data.getUTCDay() + 6) % 7;
  const segunda = new Date(data.getTime() - diaDaSemana * 86_400_000);

  return Array.from({ length: 7 }, (_, i) =>
    new Date(segunda.getTime() + i * 86_400_000).toISOString().slice(0, 10),
  );
}

/** Todos os dias da competência, de 1 ao último — a grade do mês. */
export function diasDaCompetencia(competencia: string): string[] {
  const [ano, mes] = competencia.split("-").map(Number) as [number, number];
  // Dia 0 do mês seguinte é o último deste.
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();

  return Array.from(
    { length: ultimo },
    (_, i) => `${competencia}-${String(i + 1).padStart(2, "0")}`,
  );
}

/**
 * Em que coluna o dia 1 cai, numa grade que começa na segunda.
 *
 * Sem isto o calendário desenha o mês inteiro deslocado — e um calendário
 * deslocado é pior que nenhum, porque parece certo.
 */
export function colunaDoPrimeiroDia(competencia: string): number {
  const primeiro = new Date(`${competencia}-01T00:00:00Z`);
  return (primeiro.getUTCDay() + 6) % 7;
}

/** O nome do dia da semana, para o cabeçalho do painel lateral. */
const NOMES = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"] as const;

export function nomeDoDiaDaSemana(dia: string): string {
  const data = new Date(`${dia}T00:00:00Z`);
  return NOMES[(data.getUTCDay() + 6) % 7] ?? "";
}

export function fimDeSemana(dia: string): boolean {
  const data = new Date(`${dia}T00:00:00Z`);
  return (data.getUTCDay() + 6) % 7 >= 5;
}

/** As chaves de data, reexportadas para a tela não importar de dois lugares. */
export { CHAVES_DE_DATA };

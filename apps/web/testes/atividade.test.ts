import { describe, expect, it } from "vitest";

import {
  atividadesDoMes,
  colunaDoPrimeiroDia,
  diasDaCompetencia,
  fimDeSemana,
  montarAgenda,
  nomeDoDiaDaSemana,
  pendenciasDeAgora,
  porDia,
  semanaDe,
  TIPOS_DE_ATIVIDADE,
  type MesParaAgenda,
} from "../lib/dominio/atividade";
import { datasDaCompetencia, PASSOS, type DatasDoMes } from "../lib/dominio/controle";

/**
 * As atividades que alimentam as vistas Mês e Semana.
 *
 * A propriedade que mais importa: **o estado nunca é inventado.** Ele sai do
 * passo que o mês já registra — uma atividade "feita" que não aconteceu é a
 * analista deixando de fazer o trabalho.
 */

const SETEMBRO: DatasDoMes = {
  informar: "2026-09-08",
  corte: "2026-09-10",
  boleto: "2026-09-16",
  vencimento: "2026-09-30",
};

function mes(parcial: Partial<MesParaAgenda> = {}): MesParaAgenda {
  return {
    id: "c1",
    cliente: "Indústria Modelo",
    seguradora: "Seguradora Exemplo",
    analista: "Ana",
    passo: "informar",
    datas: SETEMBRO,
    acompanhaPagamento: true,
    ...parcial,
  };
}

describe("as quatro atividades de um mês", () => {
  it("uma por data, na ordem do ciclo", () => {
    const lista = atividadesDoMes(mes(), "2026-09-05");
    expect(lista.map((a) => a.tipo)).toEqual(["informar", "corte", "boleto", "vencimento"]);
    expect(lista.map((a) => a.dia)).toEqual(["2026-09-08", "2026-09-10", "2026-09-16", "2026-09-30"]);
  });

  /**
   * Apólice sem movimentação de vidas não tem "informar até" nem "corte".
   * Inventar linha vazia na agenda faria a analista procurar trabalho que não
   * existe.
   */
  it("data nula não gera atividade", () => {
    const lista = atividadesDoMes(mes({ datas: { ...SETEMBRO, informar: null, corte: null } }), "2026-09-05");
    expect(lista.map((a) => a.tipo)).toEqual(["boleto", "vencimento"]);
  });

  it("seguradora que cobra direto não tem vencimento a controlar", () => {
    const lista = atividadesDoMes(mes({ acompanhaPagamento: false }), "2026-09-05");
    expect(lista.map((a) => a.tipo)).toEqual(["informar", "corte", "boleto"]);
  });
});

describe("o estado vem do PASSO, não de um palpite", () => {
  /**
   * A atividade é o TRABALHO, e está feita quando o mês alcançou o passo que
   * resulta dele. O passo `boleto` significa que o boleto JÁ foi anexado —
   * então "anexar boleto" está cumprida ali, não pendente.
   */
  it("em informar, nenhuma está feita", () => {
    const lista = atividadesDoMes(mes({ passo: "informar" }), "2026-09-05");
    expect(lista.every((a) => a.estado !== "feita")).toBe(true);
  });

  it("planilha recebida fecha a de informar, e só ela", () => {
    const lista = atividadesDoMes(mes({ passo: "planilha_recebida" }), "2026-09-05");
    const feitas = lista.filter((a) => a.estado === "feita").map((a) => a.tipo);
    expect(feitas).toEqual(["informar"]);
  });

  it("no passo corte, informar e corte estão feitas", () => {
    const lista = atividadesDoMes(mes({ passo: "corte" }), "2026-09-20");
    const feitas = lista.filter((a) => a.estado === "feita").map((a) => a.tipo);
    expect(feitas).toEqual(["informar", "corte"]);
  });

  it("no passo boleto, o boleto já está anexado", () => {
    const lista = atividadesDoMes(mes({ passo: "boleto" }), "2026-09-20");
    const feitas = lista.filter((a) => a.estado === "feita").map((a) => a.tipo);
    expect(feitas).toEqual(["informar", "corte", "boleto"]);
  });

  // Só o pagamento confirmado fecha o vencimento. Estar NO passo vencimento
  // significa que ele ainda não foi pago.
  it("no passo vencimento, o vencimento continua aberto", () => {
    const lista = atividadesDoMes(mes({ passo: "vencimento" }), "2026-09-25");
    const vencimento = lista.find((a) => a.tipo === "vencimento");
    expect(vencimento?.estado).toBe("pendente");
  });

  it("concluída fecha todas", () => {
    const lista = atividadesDoMes(mes({ passo: "concluida" }), "2026-10-05");
    expect(lista.every((a) => a.estado === "feita")).toBe(true);
  });

  it("nenhum passo deixa atividade sem estado", () => {
    for (const passo of PASSOS) {
      for (const atividade of atividadesDoMes(mes({ passo }), "2026-09-15")) {
        expect(["feita", "pendente", "atrasada"]).toContain(atividade.estado);
      }
    }
  });
});

describe("atrasada é prazo vencido e trabalho não feito", () => {
  it("data passada e passo parado: atrasada", () => {
    const lista = atividadesDoMes(mes({ passo: "informar" }), "2026-09-12");
    const informar = lista.find((a) => a.tipo === "informar");
    expect(informar?.estado).toBe("atrasada");
  });

  it("data passada mas trabalho feito: feita, não atrasada", () => {
    const lista = atividadesDoMes(mes({ passo: "conferida" }), "2026-09-12");
    const informar = lista.find((a) => a.tipo === "informar");
    expect(informar?.estado).toBe("feita");
  });

  it("no próprio dia ainda é pendente, não atrasada", () => {
    const lista = atividadesDoMes(mes({ passo: "informar" }), "2026-09-08");
    expect(lista.find((a) => a.tipo === "informar")?.estado).toBe("pendente");
  });
});

describe("a agenda inteira", () => {
  it("ordena por dia e, no dia, pela ordem do ciclo", () => {
    const agenda = montarAgenda(
      [
        // Um cliente informa no dia 10; o outro tem o CORTE no dia 10.
        mes({ id: "a", cliente: "Zeta", datas: { ...SETEMBRO, informar: "2026-09-10", corte: "2026-09-18" } }),
        mes({ id: "b", cliente: "Alfa", datas: { ...SETEMBRO, informar: "2026-09-02", corte: "2026-09-10" } }),
      ],
      "2026-09-05",
    );

    const noDia10 = agenda.filter((a) => a.dia === "2026-09-10");
    // `informar` vem antes de `corte` porque é a ordem do mês.
    expect(noDia10.map((a) => a.tipo)).toEqual(["informar", "corte"]);
  });

  it("desempata pelo nome, para a ordem não dançar", () => {
    const agenda = montarAgenda(
      [mes({ id: "a", cliente: "Zeta" }), mes({ id: "b", cliente: "Alfa" })],
      "2026-09-05",
    );
    const informar = agenda.filter((a) => a.tipo === "informar");
    expect(informar.map((a) => a.cliente)).toEqual(["Alfa", "Zeta"]);
  });

  it("lista vazia dá agenda vazia", () => {
    expect(montarAgenda([], "2026-09-05")).toEqual([]);
  });
});

describe("agrupar por dia", () => {
  /**
   * Os contadores mostram só o que FALTA. Um dia resolvido cheio de números
   * faria a analista conferir dez vezes o que já estava pronto.
   */
  it("conta pendentes por tipo e feitas em separado", () => {
    const agenda = montarAgenda(
      [mes({ passo: "planilha_recebida", id: "a" }), mes({ passo: "informar", id: "b" })],
      "2026-09-05",
    );
    const dias = porDia(agenda);

    const dia8 = dias.get("2026-09-08");
    // Um já entregou a planilha, o outro não.
    expect(dia8?.feitas).toBe(1);
    expect(dia8?.pendentes.informar).toBe(1);
    expect(dia8?.total).toBe(2);
  });

  it("marca o dia que tem atrasada", () => {
    const dias = porDia(montarAgenda([mes({ passo: "informar" })], "2026-09-12"));
    expect(dias.get("2026-09-08")?.temAtrasada).toBe(true);
    expect(dias.get("2026-09-30")?.temAtrasada).toBe(false);
  });
});

describe("o que o painel mostra ao abrir", () => {
  /**
   * Atrasadas de qualquer dia mais as de hoje — e não o dia 1, que é onde um
   * calendário começaria.
   */
  it("atrasadas de qualquer dia e as de hoje", () => {
    const agenda = montarAgenda([mes({ passo: "informar" })], "2026-09-10");
    const agora = pendenciasDeAgora(agenda, "2026-09-10");

    expect(agora.map((a) => a.tipo)).toEqual(["informar", "corte"]);
  });

  it("não traz feitas nem futuras", () => {
    const agenda = montarAgenda([mes({ passo: "concluida" })], "2026-09-10");
    expect(pendenciasDeAgora(agenda, "2026-09-10")).toEqual([]);
  });
});

describe("o calendário", () => {
  it("a semana vai de segunda a domingo", () => {
    // 2026-09-10 é uma quinta.
    expect(semanaDe("2026-09-10")).toEqual([
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
    ]);
  });

  it("domingo pertence à semana que começou na segunda anterior", () => {
    expect(semanaDe("2026-09-13")[0]).toBe("2026-09-07");
  });

  it("os dias da competência vão de 1 ao último", () => {
    expect(diasDaCompetencia("2026-09")).toHaveLength(30);
    expect(diasDaCompetencia("2026-10")).toHaveLength(31);
    expect(diasDaCompetencia("2026-02")).toHaveLength(28);
    // 2028 é bissexto.
    expect(diasDaCompetencia("2028-02")).toHaveLength(29);
  });

  /**
   * Sem isto o calendário desenha o mês deslocado — e deslocado é pior que
   * nenhum, porque parece certo.
   */
  it("a coluna do dia 1 põe o mês no lugar", () => {
    // 01/09/2026 é uma terça: segunda coluna numa grade que abre na segunda.
    expect(colunaDoPrimeiroDia("2026-09")).toBe(1);
    // 01/10/2026 é uma quinta.
    expect(colunaDoPrimeiroDia("2026-10")).toBe(3);
  });

  it("nomeia o dia da semana", () => {
    expect(nomeDoDiaDaSemana("2026-09-08")).toBe("Terça");
    expect(nomeDoDiaDaSemana("2026-09-13")).toBe("Domingo");
  });

  it("sábado e domingo são fim de semana", () => {
    expect(fimDeSemana("2026-09-12")).toBe(true);
    expect(fimDeSemana("2026-09-13")).toBe(true);
    expect(fimDeSemana("2026-09-11")).toBe(false);
  });
});

describe("os tipos são os cinco do v0.7, e só", () => {
  it("nenhum tipo sem rótulo", () => {
    expect(TIPOS_DE_ATIVIDADE).toEqual(["informar", "corte", "confirmar", "boleto", "vencimento"]);
  });
});

describe("confirmar emissão (5ª data)", () => {
  const regras = { informarDia: 20, corteDia: 25, confirmarDia: 26, boletoDia: 26, vencimentoDia: 20 };
  const datas = datasDaCompetencia("2026-09", regras)!;
  const mes = (troca: Partial<MesParaAgenda> = {}): MesParaAgenda => ({
    id: "m1",
    cliente: "Cliente A",
    seguradora: null,
    analista: null,
    passo: "corte",
    datas,
    acompanhaPagamento: true,
    ...troca,
  });
  const confirmar = (m: MesParaAgenda, hoje: string) => atividadesDoMes(m, hoje).find((a) => a.tipo === "confirmar");

  it("a data cai entre o corte e o boleto, e vira o mês quando o dia é menor", () => {
    expect(datas.confirmar).toBe("2026-09-26");
    expect(datasDaCompetencia("2026-09", { ...regras, confirmarDia: 2, boletoDia: 5 })?.confirmar).toBe("2026-10-02");
  });

  it("sem o dia nas regras, a atividade não existe", () => {
    const sem = datasDaCompetencia("2026-09", { ...regras, confirmarDia: null })!;
    expect("confirmar" in sem).toBe(false);
    expect(confirmar(mes({ datas: sem }), "2026-09-27")).toBeUndefined();
  });

  it("passou o dia sem confirmar, atrasada; confirmada, feita", () => {
    expect(confirmar(mes(), "2026-09-27")?.estado).toBe("atrasada");
    expect(confirmar(mes({ emissaoConfirmada: true }), "2026-09-27")?.estado).toBe("feita");
  });

  it("boleto anexado também cumpre", () => {
    expect(confirmar(mes({ passo: "boleto" }), "2026-09-27")?.estado).toBe("feita");
  });
});

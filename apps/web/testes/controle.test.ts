import { describe, expect, it } from "vitest";

import {
  aparenciaDaData,
  aplicarAcao,
  avancoAutomatico,
  competenciaDe,
  contarPrazos,
  dataEmFoco,
  datasDaCompetencia,
  mensagemDevida,
  mensagemDoPasso,
  nomeDoMes,
  passoInicial,
  podeAgir,
  proximoPasso,
  rotuloDaCompetencia,
  situacaoDoPrazo,
  type DatasDoMes,
  type RegrasDoMes,
} from "../lib/dominio/controle";

const REGRAS: RegrasDoMes = { informarDia: 8, corteDia: 10, boletoDia: 16, vencimentoDia: 30 };

const SETEMBRO: DatasDoMes = {
  informar: "2026-09-08",
  corte: "2026-09-10",
  boleto: "2026-09-16",
  vencimento: "2026-09-30",
};

describe("datas da competência", () => {
  it("monta as quatro datas no mesmo mês quando os dias estão em ordem", () => {
    expect(datasDaCompetencia("2026-09", REGRAS)).toEqual(SETEMBRO);
  });

  it("dia menor que o anterior cai no mês seguinte", () => {
    // Corte dia 25, boleto dia 26, vencimento dia 10: o vencimento é de outubro.
    expect(
      datasDaCompetencia("2026-09", { informarDia: 20, corteDia: 25, boletoDia: 26, vencimentoDia: 10 }),
    ).toEqual({
      informar: "2026-09-20",
      corte: "2026-09-25",
      boleto: "2026-09-26",
      vencimento: "2026-10-10",
    });
  });

  it("o que passou para o mês seguinte puxa as datas que vêm depois", () => {
    // Informar dia 25, corte dia 2: corte, boleto e vencimento são de outubro.
    expect(
      datasDaCompetencia("2026-09", { informarDia: 25, corteDia: 2, boletoDia: 5, vencimentoDia: 19 }),
    ).toEqual({
      informar: "2026-09-25",
      corte: "2026-10-02",
      boleto: "2026-10-05",
      vencimento: "2026-10-19",
    });
  });

  it("dia 31 em mês de 30 vira o último dia", () => {
    const datas = datasDaCompetencia("2026-09", { informarDia: 1, corteDia: 5, boletoDia: 10, vencimentoDia: 31 });
    expect(datas?.vencimento).toBe("2026-09-30");
  });

  it("fevereiro respeita o ano bissexto", () => {
    const regras = { informarDia: 1, corteDia: 5, boletoDia: 10, vencimentoDia: 30 };
    expect(datasDaCompetencia("2027-02", regras)?.vencimento).toBe("2027-02-28");
    expect(datasDaCompetencia("2028-02", regras)?.vencimento).toBe("2028-02-29");
  });

  it("dezembro vira janeiro do ano seguinte", () => {
    const datas = datasDaCompetencia("2026-12", { informarDia: 20, corteDia: 25, boletoDia: 28, vencimentoDia: 10 });
    expect(datas?.vencimento).toBe("2027-01-10");
  });

  it("apólice sem movimentação não tem informar nem corte", () => {
    const regras = { informarDia: null, corteDia: null, boletoDia: 28, vencimentoDia: 3 };
    expect(datasDaCompetencia("2026-09", regras)).toEqual({
      informar: null,
      corte: null,
      boleto: "2026-09-28",
      vencimento: "2026-10-03",
    });
    expect(passoInicial(regras)).toBe("boleto");
    expect(passoInicial(REGRAS)).toBe("informar");
  });

  it("competência malformada devolve null, não uma data inventada", () => {
    expect(datasDaCompetencia("2026-13", REGRAS)).toBeNull();
    expect(datasDaCompetencia("setembro", REGRAS)).toBeNull();
    expect(datasDaCompetencia("2026-9", REGRAS)).toBeNull();
  });
});

describe("prazo", () => {
  it("classifica pela distância até hoje", () => {
    expect(situacaoDoPrazo("2026-09-10", "2026-09-12")).toBe("vencido");
    expect(situacaoDoPrazo("2026-09-10", "2026-09-10")).toBe("hoje");
    expect(situacaoDoPrazo("2026-09-10", "2026-09-07")).toBe("perto");
    expect(situacaoDoPrazo("2026-09-10", "2026-09-06")).toBe("no_prazo");
  });

  it("atravessa a virada do mês sem errar a conta", () => {
    expect(situacaoDoPrazo("2026-10-02", "2026-09-30")).toBe("perto");
    expect(situacaoDoPrazo("2026-10-02", "2026-09-28")).toBe("no_prazo");
  });
});

describe("a data em foco de cada passo", () => {
  it("só uma data conta por vez", () => {
    expect(dataEmFoco("informar")).toBe("informar");
    expect(dataEmFoco("planilha_recebida")).toBe("corte");
    expect(dataEmFoco("conferida")).toBe("corte");
    expect(dataEmFoco("corte")).toBe("boleto");
    expect(dataEmFoco("boleto")).toBe("vencimento");
    expect(dataEmFoco("vencimento")).toBe("vencimento");
    expect(dataEmFoco("concluida")).toBeNull();
  });

  it("anteriores saem cumpridas, seguintes futuras, e a do foco leva a cor do prazo", () => {
    const hoje = "2026-09-09";
    expect(aparenciaDaData("informar", "conferida", SETEMBRO, hoje)).toBe("cumprida");
    expect(aparenciaDaData("corte", "conferida", SETEMBRO, hoje)).toBe("perto");
    expect(aparenciaDaData("boleto", "conferida", SETEMBRO, hoje)).toBe("futura");
    expect(aparenciaDaData("vencimento", "conferida", SETEMBRO, hoje)).toBe("futura");
  });

  it("planilha que não chegou fica vencida em informar, mesmo depois do corte", () => {
    expect(aparenciaDaData("informar", "informar", SETEMBRO, "2026-09-12")).toBe("vencido");
  });

  it("mês concluído não tem data colorida", () => {
    for (const chave of ["informar", "corte", "boleto", "vencimento"] as const) {
      expect(aparenciaDaData(chave, "concluida", SETEMBRO, "2026-10-05")).toBe("cumprida");
    }
  });

  it("data que a apólice não tem sai como sem data", () => {
    const semMovimento: DatasDoMes = { informar: null, corte: null, boleto: "2026-09-28", vencimento: "2026-10-03" };
    expect(aparenciaDaData("informar", "boleto", semMovimento, "2026-09-20")).toBe("sem_data");
    expect(aparenciaDaData("corte", "boleto", semMovimento, "2026-09-20")).toBe("sem_data");
  });
});

describe("transições", () => {
  it("o caminho feliz anda passo a passo", () => {
    expect(aplicarAcao("informar", "receber_planilha")).toBe("planilha_recebida");
    expect(aplicarAcao("planilha_recebida", "conferir")).toBe("conferida");
    expect(aplicarAcao("corte", "anexar_boleto")).toBe("boleto");
    expect(aplicarAcao("vencimento", "marcar_pago")).toBe("concluida");
  });

  it("pedir correção devolve o mês para informar", () => {
    expect(aplicarAcao("planilha_recebida", "pedir_correcao")).toBe("informar");
  });

  it("sem movimentação pula a conferência", () => {
    expect(aplicarAcao("informar", "sem_movimentacao")).toBe("conferida");
  });

  it("ação fora de hora não acontece", () => {
    expect(aplicarAcao("informar", "conferir")).toBeNull();
    expect(aplicarAcao("informar", "anexar_boleto")).toBeNull();
    expect(aplicarAcao("concluida", "marcar_pago")).toBeNull();
    expect(podeAgir("boleto", "pedir_correcao")).toBe(false);
  });

  it("anexar o boleto de novo troca o arquivo sem mudar de passo", () => {
    expect(aplicarAcao("boleto", "anexar_boleto")).toBe("boleto");
  });
});

describe("avanço automático", () => {
  it("conferida vira corte quando o dia chega", () => {
    expect(avancoAutomatico("conferida", SETEMBRO, "2026-09-09")).toBe("conferida");
    expect(avancoAutomatico("conferida", SETEMBRO, "2026-09-10")).toBe("corte");
    expect(avancoAutomatico("conferida", SETEMBRO, "2026-09-15")).toBe("corte");
  });

  it("boleto vira vencimento três dias antes", () => {
    expect(avancoAutomatico("boleto", SETEMBRO, "2026-09-26")).toBe("boleto");
    expect(avancoAutomatico("boleto", SETEMBRO, "2026-09-27")).toBe("vencimento");
    expect(avancoAutomatico("boleto", SETEMBRO, "2026-10-02")).toBe("vencimento");
  });

  it("nunca pula o que depende de gente", () => {
    // O corte passou e a planilha não chegou: continua em informar, atrasado.
    expect(avancoAutomatico("informar", SETEMBRO, "2026-09-20")).toBe("informar");
    expect(avancoAutomatico("planilha_recebida", SETEMBRO, "2026-09-20")).toBe("planilha_recebida");
    expect(avancoAutomatico("corte", SETEMBRO, "2026-09-29")).toBe("corte");
  });
});

describe("mensagem e próximo passo", () => {
  it("cada data tem a sua mensagem", () => {
    expect(mensagemDoPasso("informar")).toBe("informar");
    expect(mensagemDoPasso("corte")).toBe("corte");
    expect(mensagemDoPasso("boleto")).toBe("boleto");
    expect(mensagemDoPasso("vencimento")).toBe("vencimento");
  });

  it("passo que espera a analista não manda mensagem", () => {
    expect(mensagemDoPasso("planilha_recebida")).toBeNull();
    expect(mensagemDoPasso("conferida")).toBeNull();
    expect(mensagemDoPasso("concluida")).toBeNull();
  });

  it("o botão muda com o passo", () => {
    /**
     * Em `informar` o botão manda o LINK, e não abre a janela de mensagem.
     *
     * Decisão do Gabriel, 05/10: o envio pelo WhatsApp é prioridade. A tela da
     * coleta abre a conversa com o link pronto num clique. A mensagem de
     * "informar até" continua saindo sozinha por e-mail, pelo cron, com o mesmo
     * link dentro — `mensagemDoPasso("informar")` segue valendo, e é o teste
     * acima que guarda isso.
     */
    expect(proximoPasso("informar")).toEqual({ tipo: "coleta", rotulo: "Enviar link" });
    expect(proximoPasso("planilha_recebida").tipo).toBe("conferir");
    expect(proximoPasso("conferida").tipo).toBe("anexar_boleto");
    expect(proximoPasso("corte").tipo).toBe("anexar_boleto");
    expect(proximoPasso("concluida").tipo).toBe("nenhum");
    // Em vencimento a etapa espera o PAGAMENTO, não outra mensagem: o aviso já
    // saiu pelo cron três dias antes.
    expect(proximoPasso("vencimento")).toEqual({ tipo: "marcar_pago", rotulo: "Marcar pago" });
  });
});

/**
 * Seguradora que cobra direto: 39 clientes do CONTROLE FATURAS vinham com
 * vencimento `-`, `D/C` ou `BOLETO`. Não é dado faltando — é a MX não
 * acompanhando aquele pagamento.
 */
describe("quando a MX não acompanha o pagamento", () => {
  it("o mês FECHA no boleto, em vez de esperar vencimento", () => {
    expect(avancoAutomatico("boleto", SETEMBRO, "2026-09-16", false)).toBe("concluida");
  });

  it("fecha mesmo longe do vencimento — a data não importa mais", () => {
    expect(avancoAutomatico("boleto", SETEMBRO, "2026-09-01", false)).toBe("concluida");
  });

  it("acompanhando, o passo segue a regra da data", () => {
    expect(avancoAutomatico("boleto", SETEMBRO, "2026-09-16", true)).toBe("boleto");
    expect(avancoAutomatico("boleto", SETEMBRO, "2026-09-28", true)).toBe("vencimento");
  });

  it("o padrão é acompanhar: campo novo não muda quem já estava certo", () => {
    expect(avancoAutomatico("boleto", SETEMBRO, "2026-09-28")).toBe("vencimento");
  });

  it("não mexe nos passos anteriores", () => {
    expect(avancoAutomatico("informar", SETEMBRO, "2026-09-28", false)).toBe("informar");
    expect(avancoAutomatico("conferida", SETEMBRO, "2026-09-11", false)).toBe("corte");
  });

  // Avisar sobre uma data que a MX não controla faz o cliente ligar para
  // perguntar de onde veio o número.
  it("nenhuma mensagem de boleto ou vencimento sai", () => {
    expect(mensagemDevida("boleto", SETEMBRO, "2026-09-16", false)).toBeNull();
    expect(mensagemDevida("vencimento", SETEMBRO, "2026-09-28", false)).toBeNull();
  });

  it("as mensagens do começo do mês continuam saindo", () => {
    expect(mensagemDevida("informar", SETEMBRO, "2026-09-08", false)).toBe("informar");
    expect(mensagemDevida("corte", SETEMBRO, "2026-09-10", false)).toBe("corte");
  });
});

describe("a mensagem que o cron manda hoje", () => {
  it("no dia de informar, sai o aviso de informar", () => {
    expect(mensagemDevida("informar", SETEMBRO, "2026-09-08")).toBe("informar");
  });

  it("antes do dia, não sai nada", () => {
    expect(mensagemDevida("informar", SETEMBRO, "2026-09-07")).toBeNull();
    expect(mensagemDevida("corte", SETEMBRO, "2026-09-09")).toBeNull();
  });

  // O cron que não rodou num dia — deploy, manutenção — tem que mandar
  // atrasado, e não nunca.
  it("depois do dia, ainda sai", () => {
    expect(mensagemDevida("informar", SETEMBRO, "2026-09-11")).toBe("informar");
    expect(mensagemDevida("corte", SETEMBRO, "2026-09-30")).toBe("corte");
  });

  it("o passo vencimento já é a própria condição", () => {
    expect(mensagemDevida("vencimento", SETEMBRO, "2026-09-27")).toBe("vencimento");
  });

  // O boleto depende do arquivo que a analista anexa. Avisar "seu boleto está
  // disponível" sem boleto nenhum é pior que não avisar.
  it("o boleto NUNCA sai pelo cron", () => {
    expect(mensagemDevida("boleto", SETEMBRO, "2026-09-16")).toBeNull();
    expect(mensagemDevida("boleto", SETEMBRO, "2026-09-30")).toBeNull();
  });

  it("passo que espera gente não manda nada", () => {
    for (const passo of ["planilha_recebida", "conferida", "concluida"] as const) {
      expect(mensagemDevida(passo, SETEMBRO, "2026-09-30")).toBeNull();
    }
  });

  // Apólice sem movimentação de vidas não tem "informar até" nem corte: as
  // datas são nulas, e mensagem nenhuma pode sair delas.
  it("apólice sem as datas de movimentação não dispara", () => {
    const semMovimento = { ...SETEMBRO, informar: null, corte: null };
    expect(mensagemDevida("informar", semMovimento, "2026-09-30")).toBeNull();
    expect(mensagemDevida("corte", semMovimento, "2026-09-30")).toBeNull();
  });
});

describe("contadores da faixa", () => {
  it("conta pela data em foco de cada linha", () => {
    const linhas = [
      { passo: "informar" as const, datas: SETEMBRO }, // informar 08/09: vencido
      { passo: "conferida" as const, datas: SETEMBRO }, // corte 10/09: hoje
      { passo: "corte" as const, datas: { ...SETEMBRO, boleto: "2026-09-12" } }, // perto
      { passo: "boleto" as const, datas: SETEMBRO }, // vencimento 30/09: no prazo
      { passo: "planilha_recebida" as const, datas: SETEMBRO }, // para conferir + corte hoje
      { passo: "concluida" as const, datas: SETEMBRO },
    ];
    expect(contarPrazos(linhas, "2026-09-10")).toEqual({ vencidos: 1, hoje: 2, perto: 1, paraConferir: 1 });
  });

  it("lista vazia é tudo zero", () => {
    expect(contarPrazos([], "2026-09-10")).toEqual({ vencidos: 0, hoje: 0, perto: 0, paraConferir: 0 });
  });
});

describe("competência", () => {
  it("diz o mês por extenso", () => {
    expect(nomeDoMes("2026-09")).toBe("setembro");
    expect(nomeDoMes("2026-03")).toBe("março");
    expect(rotuloDaCompetencia("2026-09")).toBe("Setembro/2026");
  });

  it("malformada não inventa mês", () => {
    expect(nomeDoMes("2026")).toBe("");
    expect(rotuloDaCompetencia("xx")).toBe("xx");
  });

  it("tira a competência de um dia", () => {
    expect(competenciaDe("2026-09-22")).toBe("2026-09");
  });
});

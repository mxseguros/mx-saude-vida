import { describe, expect, it } from "vitest";

import { BOM, escaparCelula, montarCsv, nomeDoArquivo } from "../lib/dominio/csv";

describe("escaparCelula", () => {
  it("deixa texto simples como esta", () => {
    expect(escaparCelula("Ana Silva")).toBe("Ana Silva");
    expect(escaparCelula(42)).toBe("42");
  });

  it("trata nulo e indefinido como vazio", () => {
    expect(escaparCelula(null)).toBe("");
    expect(escaparCelula(undefined)).toBe("");
  });

  it("poe aspas quando ha ponto-e-virgula", () => {
    expect(escaparCelula("Silva; Souza")).toBe('"Silva; Souza"');
  });

  it("dobra as aspas de dentro", () => {
    expect(escaparCelula('Oficina "Central"')).toBe('"Oficina ""Central"""');
  });

  it("poe aspas quando ha quebra de linha", () => {
    expect(escaparCelula("linha 1\nlinha 2")).toBe('"linha 1\nlinha 2"');
  });

  describe("injecao de formula", () => {
    // A base de clientes veio de planilha, com nome digitado por gente. Um
    // campo comecando com = seria EXECUTADO pelo Excel ao abrir o arquivo.
    it("neutraliza os quatro inicios de formula", () => {
      expect(escaparCelula("=1+1")).toBe("'=1+1");
      expect(escaparCelula("+ABC")).toBe("'+ABC");
      expect(escaparCelula("-ABC")).toBe("'-ABC");
      expect(escaparCelula("@SUM(A1)")).toBe("'@SUM(A1)");
    });

    it("neutraliza a formula E escapa o separador, nesta ordem", () => {
      // O apostrofo tem que ficar DENTRO das aspas, no comeco do conteudo;
      // fora delas ele apareceria como celula propria.
      expect(escaparCelula("=HYPERLINK(a;b)")).toBe(`"'=HYPERLINK(a;b)"`);
    });

    it("nao mexe em numero negativo ja convertido em texto pelo chamador", () => {
      // Registrado como comportamento conhecido: "-500" recebe o apostrofo.
      // E o preco de nao executar formula, e vale — valor monetario sai
      // formatado pelo chamador, nao com sinal na frente.
      expect(escaparCelula("-500")).toBe("'-500");
    });
  });
});

describe("montarCsv", () => {
  it("comeca com BOM, senao o Excel come os acentos", () => {
    const csv = montarCsv(["Coluna"], [["Assistência Técnica"]]);
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv).toContain("Assistência Técnica");
  });

  it("separa por ponto-e-virgula, nao por virgula", () => {
    // Com virgula, o Excel em portugues abre tudo numa coluna so.
    const csv = montarCsv(["A", "B"], [["1", "2"]]);
    expect(csv).toContain("A;B");
    expect(csv).toContain("1;2");
  });

  it("termina cada linha com CRLF", () => {
    const csv = montarCsv(["A"], [["1"], ["2"]]);
    expect(csv).toBe(`${BOM}A\r\n1\r\n2\r\n`);
  });

  it("monta arquivo so com cabecalho quando nao ha linhas", () => {
    expect(montarCsv(["Ticket", "Cliente"], [])).toBe(`${BOM}Ticket;Cliente\r\n`);
  });
});

describe("nomeDoArquivo", () => {
  it("usa data que ordena sozinha na pasta", () => {
    expect(nomeDoArquivo("tickets", "2026-09-05")).toBe("tickets-2026-09-05.csv");
  });

  it("aceita timestamp completo", () => {
    expect(nomeDoArquivo("tickets", "2026-09-05T13:22:10Z")).toBe("tickets-2026-09-05.csv");
  });

  it("limpa o que nao serve em nome de arquivo", () => {
    expect(nomeDoArquivo("Lista de Tickets", "2026-09-05")).toBe(
      "lista-de-tickets-2026-09-05.csv",
    );
  });
});

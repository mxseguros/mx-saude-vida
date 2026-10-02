import { describe, expect, it } from "vitest";

import {
  acharLinhaDigitavel,
  codigoDeBarras,
  datasDoTexto,
  digitoGeralConfere,
  lerBoleto,
  parcelaDoTexto,
  valorDaLinha,
  valoresDoTexto,
  vencimentoDoFator,
} from "../lib/dominio/boleto";

/**
 * Leitura do boleto.
 *
 * As linhas digitáveis destes testes são SINTÉTICAS: banco 9999 e campo livre
 * inventado, com o dígito verificador calculado para serem válidas. A linha de
 * um boleto real carrega a conta do beneficiário e o nosso número — ela é o
 * código de pagamento, e este repositório é público.
 *
 * O leitor foi conferido contra o boleto real de `Docs/` fora do repo: R$
 * 650,14, vencimento 30/09/2026, parcela 44, confiança alta.
 */

/** Fator 1585, R$ 650,14. Vence 30/09/2026 no ciclo atual. */
const LINHA = "99991234500987654321009876543210315850000065014";

/** Fator 1626, R$ 1.234,56. Vence 10/11/2026. */
const OUTRA = "99991234500987654321009876543210616260000123456";

/** Mesma linha, valor zerado — boleto em branco existe e não é erro. */
const SEM_VALOR = "99991234500987654321009876543210315850000000000";

const HOJE = "2026-10-02";

describe("o dígito verificador", () => {
  it("aceita linha válida", () => {
    expect(digitoGeralConfere(LINHA)).toBe(true);
    expect(digitoGeralConfere(OUTRA)).toBe(true);
  });

  /**
   * É o que separa "achei 47 dígitos" de "achei um boleto". Sem ele, um número
   * de apólice longo no PDF viraria valor a cobrar do cliente.
   */
  it("recusa um dígito trocado", () => {
    const torta = `${LINHA.slice(0, 32)}${(Number(LINHA[32]) + 1) % 10}${LINHA.slice(33)}`;
    expect(digitoGeralConfere(torta)).toBe(false);
  });

  it("recusa tamanho errado e não-dígito", () => {
    expect(digitoGeralConfere(LINHA.slice(0, 46))).toBe(false);
    expect(digitoGeralConfere(`${LINHA.slice(0, 46)}x`)).toBe(false);
  });

  it("o código de barras remontado tem 44 dígitos", () => {
    const barras = codigoDeBarras(LINHA);
    expect(barras).toHaveLength(44);
    // Banco e moeda abrem, e o fator e o valor vêm logo depois do verificador.
    expect(barras?.slice(0, 4)).toBe("9999");
    expect(barras?.slice(5, 19)).toBe("15850000065014");
  });
});

describe("valor e vencimento, da linha digitável", () => {
  it("lê o valor em centavos", () => {
    expect(valorDaLinha(LINHA)).toBe(650.14);
    expect(valorDaLinha(OUTRA)).toBe(1234.56);
  });

  it("valor zerado vira nulo, não R$ 0,00", () => {
    expect(valorDaLinha(SEM_VALOR)).toBeNull();
  });

  /**
   * O fator deu a volta: chegou a 9999 em 21/02/2025 e voltou a 1000 no dia
   * seguinte. O mesmo fator significa duas datas, e o desempate é "hoje".
   */
  it("escolhe o ciclo pela data de hoje", () => {
    expect(vencimentoDoFator(LINHA, "2026-10-02")).toBe("2026-09-30");
    expect(vencimentoDoFator(LINHA, "1999-01-01")).toBe("1999-05-15");
  });

  it("outro fator, outra data", () => {
    expect(vencimentoDoFator(OUTRA, HOJE)).toBe("2026-11-10");
  });

  it("fator abaixo de 1000 não é data", () => {
    const semFator = `${LINHA.slice(0, 33)}0000${LINHA.slice(37)}`;
    expect(vencimentoDoFator(semFator, HOJE)).toBeNull();
  });
});

describe("achar a linha no texto", () => {
  it("acha com a pontuação do papel", () => {
    const texto = `BANCO 9999-9  99991.23450 09876.543210 09876.543210 3 15850000065014\nPagável em qualquer banco`;
    expect(acharLinhaDigitavel(texto)).toBe(LINHA);
  });

  it("acha corrida, sem pontuação", () => {
    expect(acharLinhaDigitavel(`cabeçalho\n${LINHA}\nrodapé`)).toBe(LINHA);
  });

  it("não inventa linha onde não há", () => {
    expect(acharLinhaDigitavel("Apólice 1099300020949 · protocolo 269687577")).toBeNull();
  });

  // 47 dígitos que não são boleto: o verificador recusa.
  it("recusa sequência longa que não passa no verificador", () => {
    expect(acharLinhaDigitavel(`ref ${"1".repeat(47)} fim`)).toBeNull();
  });
});

describe("o texto, para confirmar", () => {
  it("datas saem em ISO, sem repetir e em ordem", () => {
    expect(datasDoTexto("emitido 16/09/2026 vence 30/09/2026 · 16/09/2026")).toEqual([
      "2026-09-16",
      "2026-09-30",
    ]);
  });

  it("valores saem em número, e o zero fica fora", () => {
    expect(valoresDoTexto("R$ 650,14 desconto 0,00 total 1.234,56")).toEqual([650.14, 1234.56]);
  });

  /**
   * O boleto está cheio de sequências de 2 e 3 dígitos — carteira, agência,
   * espécie. Pegar a primeira poria "148" no lugar de "44".
   */
  it("a parcela vem do rótulo, não do primeiro número", () => {
    expect(parcelaDoTexto("Carteira 148 Nosso Número 26968757-7 Parcela: 44")).toBe("44");
    expect(parcelaDoTexto("Parcela 03/12")).toBe("3");
    expect(parcelaDoTexto("Carteira 148 · espécie RC")).toBeNull();
  });
});

describe("lerBoleto", () => {
  it("com linha digitável e texto concordando, confiança alta e nenhum aviso", () => {
    const texto = `Vencimento 30/09/2026\nValor do Documento R$ 650,14\nParcela: 44\n${LINHA}`;
    const campos = lerBoleto(texto, HOJE);

    expect(campos.valor).toBe(650.14);
    expect(campos.vencimento).toBe("2026-09-30");
    expect(campos.parcela).toBe("44");
    expect(campos.confianca).toBe("alta");
    expect(campos.avisos).toEqual([]);
  });

  /**
   * A divergência é o caso que importa: a analista precisa saber ANTES de
   * salvar, porque valor errado aqui é cobrança errada ao cliente.
   */
  it("texto que não confirma o valor baixa a confiança e avisa", () => {
    const texto = `Vencimento 30/09/2026\nValor R$ 999,99\n${LINHA}`;
    const campos = lerBoleto(texto, HOJE);

    // O valor da LINHA continua valendo: ele é o que o banco vai cobrar.
    expect(campos.valor).toBe(650.14);
    expect(campos.confianca).toBe("media");
    expect(campos.avisos.join(" ")).toContain("valor");
  });

  it("texto que não confirma a data avisa", () => {
    const texto = `Vencimento 15/10/2026\nR$ 650,14\n${LINHA}`;
    const campos = lerBoleto(texto, HOJE);

    expect(campos.vencimento).toBe("2026-09-30");
    expect(campos.confianca).toBe("media");
    expect(campos.avisos.join(" ")).toContain("vencimento");
  });

  it("sem linha digitável, cai no texto e diz que caiu", () => {
    const texto = "Data do documento 16/09/2026\nVencimento 30/09/2026\nValor R$ 650,14\nParcela: 44";
    const campos = lerBoleto(texto, HOJE);

    // A data maior é a mais provável: o vencimento vem depois da emissão.
    expect(campos.vencimento).toBe("2026-09-30");
    expect(campos.valor).toBe(650.14);
    expect(campos.linhaDigitavel).toBeNull();
    expect(campos.confianca).toBe("media");
    expect(campos.avisos.join(" ")).toContain("linha digitável");
  });

  it("PDF que não dá para ler pede digitação, sem inventar campo", () => {
    const campos = lerBoleto("documento digitalizado sem texto", HOJE);

    expect(campos.valor).toBeNull();
    expect(campos.vencimento).toBeNull();
    expect(campos.confianca).toBe("nenhuma");
    expect(campos.avisos.join(" ")).toContain("à mão");
  });

  it("boleto sem valor na linha avisa, em vez de cobrar zero", () => {
    const texto = `Vencimento 30/09/2026\n${SEM_VALOR}`;
    const campos = lerBoleto(texto, HOJE);

    expect(campos.valor).toBeNull();
    expect(campos.confianca).toBe("media");
    expect(campos.avisos.join(" ")).toContain("valor");
  });

  it("a parcela é lida mesmo quando o resto falha", () => {
    expect(lerBoleto("Parcela: 7", HOJE).parcela).toBe("7");
  });
});

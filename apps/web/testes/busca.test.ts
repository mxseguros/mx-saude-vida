import { describe, expect, it } from "vitest";

import { casaBusca, ordemAlfabetica } from "../lib/dominio/busca";

const alvo = { nomes: ["Padaria São João", "Padaria Exemplo Ltda"], documento: "99999999000191" };

describe("busca do Controle", () => {
  it("acha pelo nome sem acento nem caixa", () => {
    expect(casaBusca("sao joao", alvo)).toBe(true);
    expect(casaBusca("EXEMPLO", alvo)).toBe(true);
    expect(casaBusca("mercado", alvo)).toBe(false);
  });

  it("acha pelo CNPJ, com ou sem pontuação", () => {
    expect(casaBusca("99.999.999/0001", alvo)).toBe(true);
    expect(casaBusca("000191", alvo)).toBe(true);
  });

  it("termo vazio acha tudo", () => {
    expect(casaBusca("  ", alvo)).toBe(true);
  });

  // Dois dígitos achariam meio Controle: "20" está em quase todo CNPJ.
  it("número curto demais não busca no CNPJ", () => {
    expect(casaBusca("91", { nomes: ["Outro"], documento: "99999999000191" })).toBe(false);
  });

  it("ordena em português, sem caixa pesar", () => {
    const nomes = ordemAlfabetica(["banco", "Água Viva", "Zebra", "abc"], (n) => n);
    expect(nomes).toEqual(["abc", "Água Viva", "banco", "Zebra"]);
  });
});

import { describe, expect, it } from "vitest";
import {
  cnpjValido,
  cpfValido,
  documentoValido,
  formatarDocumento,
  mascararDocumento,
  normalizarDocumento,
  pareceDocumento,
  tipoDocumento,
} from "../lib/dominio/documento";

// CPF e CNPJ sinteticos com DV correto. Nenhum pertence a pessoa ou empresa
// real: o CPF esta na faixa 999, que a Receita nao emite, e o CNPJ tem raiz
// acima de 90.000.000.
const CPF = "99900000005";
const CNPJ = "99999999000191";

describe("mascara de listagem", () => {
  it("esconde as pontas do CPF e deixa o meio para conferencia", () => {
    expect(mascararDocumento(CPF)).toBe("***.000.000-**");
    expect(mascararDocumento("999.001.234-25")).toBe("***.001.234-**");
  });
  it("esconde so o digito verificador do CNPJ", () => {
    expect(mascararDocumento(CNPJ)).toBe("99.999.999/0001-**");
  });
  it("devolve a entrada quando nao e documento", () => {
    expect(mascararDocumento("abc")).toBe("abc");
  });
});

describe("normalizacao", () => {
  it("guarda so digito", () => {
    expect(normalizarDocumento("999.001.234-25")).toBe("99900123425");
    expect(normalizarDocumento("99.999.999/0001-91")).toBe("99999999000191");
  });

  it("reconhece o tipo pelo tamanho", () => {
    expect(tipoDocumento(CPF)).toBe("cpf");
    expect(tipoDocumento(CNPJ)).toBe("cnpj");
    expect(tipoDocumento("123")).toBeNull();
  });
});

describe("formatacao", () => {
  it("aplica a mascara de cada tipo", () => {
    expect(formatarDocumento("99900123425")).toBe("999.001.234-25");
    expect(formatarDocumento("99999999000191")).toBe("99.999.999/0001-91");
  });

  it("devolve a entrada quando nao reconhece", () => {
    // Cadastro incompleto existe na base real; a tela mostra o que tem em vez
    // de inventar mascara.
    expect(formatarDocumento("123")).toBe("123");
    expect(formatarDocumento("")).toBe("");
  });
});

describe("digito verificador", () => {
  it("aceita documento correto", () => {
    expect(cpfValido(CPF)).toBe(true);
    expect(cnpjValido(CNPJ)).toBe(true);
    expect(documentoValido(CPF)).toBe(true);
    expect(documentoValido(CNPJ)).toBe(true);
  });

  it("recusa quando um digito muda", () => {
    expect(cpfValido("99900000004")).toBe(false);
    expect(cnpjValido("99999999000192")).toBe(false);
  });

  it("os dois digitos do CPF sao diferentes entre si", () => {
    // A armadilha do MX Leads: com a lista de pesos curta demais, os dois
    // digitos saem iguais e o documento parece valido sem ser. Se o algoritmo
    // regredir, este caso quebra.
    expect(cpfValido("11144477735")).toBe(true);
    expect(cpfValido("11144477700")).toBe(false);
  });

  it("recusa sequencia repetida", () => {
    // Passa no calculo e nao existe na vida.
    expect(cpfValido("11111111111")).toBe(false);
    expect(cnpjValido("11111111111111")).toBe(false);
  });

  it("recusa tamanho errado", () => {
    expect(documentoValido("999000000")).toBe(false);
    expect(documentoValido("")).toBe(false);
  });
});

describe("pareceDocumento", () => {
  it("trata sequencia longa de digito como documento", () => {
    expect(pareceDocumento("99900123425")).toBe(true);
    expect(pareceDocumento("390.533")).toBe(true);
  });

  it("nao trata tres digitos como documento", () => {
    // "390" tambem aparece em nome de empresa; buscar so na coluna de
    // documento perderia o cliente.
    expect(pareceDocumento("390")).toBe(false);
  });

  it("nome nunca e documento", () => {
    expect(pareceDocumento("Maria Oliveira")).toBe(false);
    expect(pareceDocumento("Transportes 390")).toBe(false);
  });
});

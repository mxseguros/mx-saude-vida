import { describe, expect, it } from "vitest";

import {
  digitosDoTelefone,
  formatarTelefone,
  linkTelefone,
} from "../lib/dominio/telefone";

describe("formatarTelefone", () => {
  it("formata celular com DDD", () => {
    expect(formatarTelefone("11987654321")).toBe("(11) 98765-4321");
  });

  it("formata fixo com DDD", () => {
    expect(formatarTelefone("1134567890")).toBe("(11) 3456-7890");
  });

  it("formata sem DDD", () => {
    expect(formatarTelefone("987654321")).toBe("98765-4321");
    expect(formatarTelefone("34567890")).toBe("3456-7890");
  });

  it("reconhece o 55 do Brasil e devolve com +55", () => {
    expect(formatarTelefone("5511987654321")).toBe("+55 (11) 98765-4321");
    expect(formatarTelefone("551134567890")).toBe("+55 (11) 3456-7890");
  });

  it("aceita entrada que ja vem mascarada", () => {
    expect(formatarTelefone("(11) 98765-4321")).toBe("(11) 98765-4321");
  });

  it("DEVOLVE O ORIGINAL quando nao reconhece o formato", () => {
    // O ponto do teste: recortar para caber inventaria um numero que ninguem
    // atende. Melhor mostrar como esta e a pessoa decidir.
    expect(formatarTelefone("123")).toBe("123");
    expect(formatarTelefone("11987654321234")).toBe("11987654321234");
    expect(formatarTelefone("+1 415 555 0134")).toBe("+1 415 555 0134");
  });

  it("trata vazio, nulo e indefinido", () => {
    expect(formatarTelefone("")).toBe("");
    expect(formatarTelefone(null)).toBe("");
    expect(formatarTelefone(undefined)).toBe("");
  });

  it("nao confunde 12 digitos que nao comecam com 55", () => {
    expect(formatarTelefone("119876543210")).toBe("119876543210");
  });
});

describe("digitosDoTelefone", () => {
  it("tira tudo que nao e digito", () => {
    expect(digitosDoTelefone("(11) 98765-4321")).toBe("11987654321");
    expect(digitosDoTelefone("+55 11 98765 4321")).toBe("5511987654321");
  });
});

describe("linkTelefone", () => {
  it("monta tel: com digitos apenas", () => {
    expect(linkTelefone("(11) 98765-4321")).toBe("tel:11987654321");
  });

  it("poe o + quando ha codigo de pais", () => {
    expect(linkTelefone("5511987654321")).toBe("tel:+5511987654321");
  });

  it("recusa numero curto demais para discar", () => {
    expect(linkTelefone("1234")).toBeNull();
    expect(linkTelefone("")).toBeNull();
    expect(linkTelefone(null)).toBeNull();
  });
});

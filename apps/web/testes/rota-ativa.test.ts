import { describe, expect, it } from "vitest";
import { montarMenu, rotaAtiva } from "../app/_admin/navegacao";

/**
 * Qual item do menu fica destacado.
 *
 * A rota sai do roteador, e a regra do casamento é o que este teste protege:
 * uma tela nova que destaca o item errado — ou nenhum — não quebra nada, e por
 * isso ninguém repara.
 */
describe("rota ativa", () => {
  it("casa a própria rota", () => {
    expect(rotaAtiva("/controle", "/controle")).toBe(true);
    expect(rotaAtiva("/clientes", "/clientes")).toBe(true);
  });

  it("casa a sub-rota: a conferência mantém o Controle destacado", () => {
    expect(rotaAtiva("/controle/abc/conferir", "/controle")).toBe(true);
    expect(rotaAtiva("/clientes/novo", "/clientes")).toBe(true);
  });

  it("não casa rota diferente", () => {
    expect(rotaAtiva("/clientes", "/controle")).toBe(false);
  });

  it("não casa por prefixo de TEXTO, só por segmento", () => {
    expect(rotaAtiva("/controle-antigo", "/controle")).toBe(false);
    expect(rotaAtiva("/clientes-antigos", "/clientes")).toBe(false);
  });

  it("rota vazia não destaca nada", () => {
    expect(rotaAtiva("", "/controle")).toBe(false);
  });
});

describe("menu", () => {
  it("tem Controle e Clientes, nessa ordem", () => {
    const itens = montarMenu().flatMap((g) => g.itens.map((i) => i.href));
    expect(itens).toEqual(["/controle", "/clientes"]);
  });

  it("leva os contadores para o Controle", () => {
    const controle = montarMenu({ pendentes: 4, vencidos: 1 })[0]?.itens[0];
    expect(controle?.contagem).toBe(4);
    expect(controle?.atencao).toBe(1);
  });
});

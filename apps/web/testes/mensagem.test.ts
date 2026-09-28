import { describe, expect, it } from "vitest";

import {
  canaisPossiveis,
  linkWhatsapp,
  montarMensagem,
  variaveisDaMensagem,
  variaveisInvalidas,
  VARIAVEIS_DA_MENSAGEM,
  type ContextoDaMensagem,
} from "../lib/dominio/mensagem";

const CONTEXTO: ContextoDaMensagem = {
  cliente: "Empresa Exemplo",
  gestor: "Ana Paula Souza",
  competencia: "2026-09",
  data: "2026-09-08",
  dataCorte: "2026-09-10",
  dataBoleto: "2026-09-16",
  dataVencimento: "2026-09-30",
  valorDoBoleto: 650.14,
  link: "https://saudevida.exemplo.test/portal",
  seguradora: "Seguradora Exemplo",
  analista: "Carla Mendes",
};

describe("variáveis", () => {
  it("toda variável da lista tem valor", () => {
    const valores = variaveisDaMensagem(CONTEXTO);
    expect(Object.keys(valores).sort()).toEqual([...VARIAVEIS_DA_MENSAGEM].sort());
  });

  it("cumprimenta pelo primeiro nome", () => {
    const valores = variaveisDaMensagem(CONTEXTO);
    expect(valores.gestor).toBe("Ana");
    expect(valores.analista).toBe("Carla");
  });

  it("formata data, mês e valor como o cliente lê", () => {
    const valores = variaveisDaMensagem(CONTEXTO);
    expect(valores.data).toBe("08/09/2026");
    expect(valores.data_vencimento).toBe("30/09/2026");
    expect(valores.mes).toBe("setembro");
    expect(valores.valor).toBe("R$ 650,14");
  });

  it("o que falta vira vazio, nunca 'null'", () => {
    const valores = variaveisDaMensagem({ ...CONTEXTO, gestor: null, valorDoBoleto: null, data: null });
    expect(valores.gestor).toBe("");
    expect(valores.valor).toBe("");
    expect(valores.data).toBe("");
  });
});

describe("montar a mensagem", () => {
  it("troca as variáveis pelo valor", () => {
    const texto = montarMensagem(
      "Olá, {{gestor}}! A movimentação de {{mes}} da {{cliente}} precisa chegar até {{data}}: {{link}}",
      CONTEXTO,
    );
    expect(texto).toBe(
      "Olá, Ana! A movimentação de setembro da Empresa Exemplo precisa chegar até 08/09/2026: https://saudevida.exemplo.test/portal",
    );
  });

  it("variável sem valor não deixa pontuação solta", () => {
    const texto = montarMensagem("{{gestor}} , o boleto de {{mes}} ({{valor}}) vence em {{data}} .", {
      ...CONTEXTO,
      gestor: null,
      valorDoBoleto: null,
    });
    expect(texto).toBe(", o boleto de setembro () vence em 08/09/2026.");
  });

  it("variável desconhecida some em vez de aparecer como chave", () => {
    expect(montarMensagem("Olá {{nome_que_nao_existe}}!", CONTEXTO)).toBe("Olá!");
  });

  it("avisa quais variáveis do modelo não existem", () => {
    expect(variaveisInvalidas("{{gestor}}, veja {{link}} e {{cor_do_boleto}}")).toEqual(["cor_do_boleto"]);
    expect(variaveisInvalidas("{{gestor}} {{cliente}} {{motivo}}")).toEqual([]);
  });

  it("mantém parágrafo, mas não pilha de linhas em branco", () => {
    expect(montarMensagem("Olá.\n\n\n\nAté logo.", CONTEXTO)).toBe("Olá.\n\nAté logo.");
  });
});

describe("link do WhatsApp", () => {
  it("põe o 55 no número brasileiro", () => {
    expect(linkWhatsapp("(11) 95555-0101", "oi")).toBe("https://wa.me/5511955550101?text=oi");
    expect(linkWhatsapp("1155550101", "oi")).toBe("https://wa.me/551155550101?text=oi");
  });

  it("não repete o 55 de quem já tem", () => {
    expect(linkWhatsapp("+55 11 95555-0101", "oi")).toBe("https://wa.me/5511955550101?text=oi");
  });

  it("codifica acento, espaço e quebra de linha", () => {
    const link = linkWhatsapp("11955550101", "Olá, Ana!\nAté 08/09.");
    expect(link).toBe("https://wa.me/5511955550101?text=Ol%C3%A1%2C%20Ana!%0AAt%C3%A9%2008%2F09.");
  });

  it("telefone que não dá para discar devolve null", () => {
    expect(linkWhatsapp("", "oi")).toBeNull();
    expect(linkWhatsapp(null, "oi")).toBeNull();
    expect(linkWhatsapp("5555-0101", "oi")).toBeNull();
  });

  it("corta texto longo demais para o link abrir", () => {
    const link = linkWhatsapp("11955550101", "a".repeat(5000));
    const texto = decodeURIComponent((link ?? "").split("?text=")[1] ?? "");
    expect(texto.length).toBe(1800);
    expect(texto.endsWith("…")).toBe(true);
  });
});

describe("canais", () => {
  const completo = { celular: "11955550101", email: "rh@exemplo.test" };

  it("segue o canal do cadastro", () => {
    expect(canaisPossiveis("whatsapp", completo)).toEqual({ whatsapp: true, email: false });
    expect(canaisPossiveis("email", completo)).toEqual({ whatsapp: false, email: true });
    expect(canaisPossiveis("ambos", completo)).toEqual({ whatsapp: true, email: true });
  });

  it("canal sem contato cadastrado não é oferecido", () => {
    expect(canaisPossiveis("ambos", { celular: null, email: "rh@exemplo.test" })).toEqual({
      whatsapp: false,
      email: true,
    });
    expect(canaisPossiveis("whatsapp", { celular: "", email: null })).toEqual({ whatsapp: false, email: false });
  });
});

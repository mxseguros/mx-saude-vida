import { describe, expect, it } from "vitest";

import { marcosDepoisDoEnvio, pendenciaDoCliente, podeEnviarPlanilha } from "../lib/dominio/portal";
import { PASSOS, type DatasDoMes } from "../lib/dominio/controle";

/**
 * O mês visto pelo cliente.
 *
 * Duas propriedades valem para tudo aqui: **nenhum passo deixa a tela em
 * branco** — silêncio faz o gestor ligar para perguntar se a planilha chegou — e
 * **o vocabulário da operação não escapa** para o texto que ele lê.
 */

const SETEMBRO: DatasDoMes = {
  informar: "2026-09-08",
  corte: "2026-09-10",
  boleto: "2026-09-16",
  vencimento: "2026-09-30",
};

describe("a pendência do cliente", () => {
  it("em informar, pede a planilha e mostra o prazo", () => {
    const p = pendenciaDoCliente("informar", SETEMBRO, "2026-09", "2026-09-05");
    expect(p.tipo).toBe("enviar_planilha");
    expect(p.prazo).toBe("2026-09-08");
    expect(p.urgente).toBe(false);
  });

  it("no dia do prazo, fica urgente e o texto diz que é hoje", () => {
    const p = pendenciaDoCliente("informar", SETEMBRO, "2026-09", "2026-09-08");
    expect(p.urgente).toBe(true);
    expect(p.detalhe).toContain("hoje");
  });

  it("prazo vencido continua pedindo a planilha, sem culpar quem lê", () => {
    const p = pendenciaDoCliente("informar", SETEMBRO, "2026-09", "2026-09-12");
    expect(p.tipo).toBe("enviar_planilha");
    expect(p.urgente).toBe(true);
    // "assim que puder", e não "você está atrasado": a cobrança é da MX, pelo
    // canal dela, não de uma tela.
    expect(p.detalhe).toContain("assim que puder");
  });

  it("depois do envio, diz o que a MX está fazendo", () => {
    const p = pendenciaDoCliente("planilha_recebida", SETEMBRO, "2026-09", "2026-09-09");
    expect(p.tipo).toBe("aguardando_mx");
    expect(p.urgente).toBe(false);
  });

  it("conferida e corte são a mesma espera para quem lê", () => {
    const a = pendenciaDoCliente("conferida", SETEMBRO, "2026-09", "2026-09-11");
    const b = pendenciaDoCliente("corte", SETEMBRO, "2026-09", "2026-09-11");
    expect(a.tipo).toBe("aguardando_mx");
    expect(b.tipo).toBe("aguardando_mx");
    expect(a.titulo).toBe(b.titulo);
  });

  it("com boleto, aponta o vencimento e o valor fica para a tela", () => {
    const p = pendenciaDoCliente("boleto", SETEMBRO, "2026-09", "2026-09-20");
    expect(p.tipo).toBe("pagar_boleto");
    expect(p.prazo).toBe("2026-09-30");
    expect(p.urgente).toBe(false);
  });

  it("boleto vencido manda falar com a MX antes de pagar", () => {
    const p = pendenciaDoCliente("boleto", SETEMBRO, "2026-09", "2026-10-02");
    expect(p.urgente).toBe(true);
    expect(p.detalhe).toContain("MX");
  });

  it("concluída não pede nada", () => {
    const p = pendenciaDoCliente("concluida", SETEMBRO, "2026-09", "2026-10-02");
    expect(p.tipo).toBe("nada");
    expect(p.prazo).toBeNull();
  });

  it("nenhum passo deixa título ou detalhe vazio", () => {
    for (const passo of PASSOS) {
      const p = pendenciaDoCliente(passo, SETEMBRO, "2026-09", "2026-09-15");
      expect(p.titulo.trim().length).toBeGreaterThan(0);
      expect(p.detalhe.trim().length).toBeGreaterThan(0);
    }
  });

  // O gestor do cliente não conhece "corte", "competência" nem "conferida", e
  // não deveria: a tela dele responde "preciso fazer algo?".
  it("não vaza o vocabulário da operação", () => {
    for (const passo of PASSOS) {
      const p = pendenciaDoCliente(passo, SETEMBRO, "2026-09", "2026-09-15");
      const texto = `${p.titulo} ${p.detalhe}`.toLowerCase();
      for (const palavra of ["corte", "competência", "conferida", "passo", "etapa"]) {
        // Palavra INTEIRA: "o prazo passou" é português normal e não tem nada a
        // ver com o "passo" da máquina de estados.
        expect(texto).not.toMatch(new RegExp(`\b${palavra}\b`));
      }
    }
  });

  // Apólice sem movimentação de vidas não tem "informar até": o mês nasce em
  // boleto, e nunca pede planilha.
  it("apólice sem movimentação não pede planilha", () => {
    const semMovimento = { ...SETEMBRO, informar: null, corte: null };
    const p = pendenciaDoCliente("boleto", semMovimento, "2026-09", "2026-09-20");
    expect(p.tipo).toBe("pagar_boleto");
  });
});

describe("podeEnviarPlanilha", () => {
  it("só em informar e planilha_recebida", () => {
    // `planilha_recebida` continua aberto porque `sem_movimentacao` parte dele:
    // o gestor que mandou o arquivo errado ainda consegue se corrigir.
    expect(podeEnviarPlanilha("informar")).toBe(true);
    expect(podeEnviarPlanilha("planilha_recebida")).toBe(true);
  });

  it("depois de conferida, não", () => {
    for (const passo of ["conferida", "corte", "boleto", "vencimento", "concluida"] as const) {
      expect(podeEnviarPlanilha(passo)).toBe(false);
    }
  });
});

describe("os marcos depois do envio", () => {
  it("começam no agora e terminam no vencimento", () => {
    const marcos = marcosDepoisDoEnvio(SETEMBRO, "2026-09");
    expect(marcos[0]?.quando).toBe("Agora");
    expect(marcos[marcos.length - 1]?.quando).toBe("30/09");
  });

  it("sem data de corte, o marco do corte não aparece", () => {
    const marcos = marcosDepoisDoEnvio({ ...SETEMBRO, corte: null }, "2026-09");
    expect(marcos.some((m) => m.o_que.includes("seguradora"))).toBe(false);
    // Boleto e vencimento continuam: eles existem em toda apólice.
    expect(marcos.some((m) => m.quando === "16/09")).toBe(true);
  });

  it("nenhum marco fica sem texto", () => {
    for (const marco of marcosDepoisDoEnvio(SETEMBRO, "2026-09")) {
      expect(marco.quando.trim().length).toBeGreaterThan(0);
      expect(marco.o_que.trim().length).toBeGreaterThan(0);
    }
  });
});

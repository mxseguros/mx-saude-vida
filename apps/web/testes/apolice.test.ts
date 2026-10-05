import { describe, expect, it } from "vitest";

import { esquemaApolice, esquemaCapital, PAGINAS_LIDAS } from "../lib/ia/apolice";
import { AGENTES, agenteValido, PROMPTS_PADRAO } from "../lib/ia/prompts";

/**
 * O esquema da leitura da apólice.
 *
 * Sem chamar o modelo: estes testes guardam o CONTRATO, e a leitura de verdade
 * foi provada contra as três apólices reais que estão em `Docs/`, fora do repo.
 *
 * O que a prova real devolveu, em 05/10:
 *
 * | documento             | apólice           | capital        | taxa     |
 * |-----------------------|-------------------|----------------|----------|
 * | Prudential (em grupo) | 1099300020949/1   | por_cargo (2)  | 1.339977 |
 * | Porto (individual)    | 26.1391.2239194   | por_cobertura  | null     |
 * | Tokio                 | 37924826          | por_cobertura  | null     |
 */

/** Uma leitura completa e válida, para os testes partirem de algo que passa. */
function leitura(troca: Record<string, unknown> = {}) {
  return {
    numeroApolice: "1099300020949/1",
    numeroContrato: null,
    seguradora: "Seguradora Exemplo",
    produto: "VG Express",
    segurado: "Indústria Modelo Ltda",
    documentoSegurado: "11222333000181",
    vigenciaInicio: "2025-12-31",
    vigenciaFim: "2026-12-31",
    taxaPorMil: 1.339977,
    limiteDeIdade: 70,
    capital: { tipo: "por_cargo", faixas: [{ rotulo: "Funcionário", capital: 23103.62 }] },
    ilegivel: [],
    ...troca,
  };
}

describe("as quatro formas de capital", () => {
  /**
   * A Prudential tem capital POR CARGO — Funcionário 23.103,62 e Sócio
   * 173.277,15. Um campo `capital: number` forçaria o modelo a escolher um dos
   * dois e jogar o outro fora, e a conferência da planilha compararia contra o
   * número errado todo mês.
   */
  it("por cargo guarda todas as faixas", () => {
    const r = esquemaCapital.safeParse({
      tipo: "por_cargo",
      faixas: [
        { rotulo: "Funcionário", capital: 23103.62 },
        { rotulo: "Sócio", capital: 173277.15 },
      ],
    });
    expect(r.success).toBe(true);
    if (r.success && r.data.tipo === "por_cargo") expect(r.data.faixas).toHaveLength(2);
  });

  // A Porto individual tem capital por GARANTIA: Morte, Morte Acidental,
  // Invalidez, Assistência Funeral — seis valores diferentes.
  it("por cobertura idem", () => {
    const r = esquemaCapital.safeParse({
      tipo: "por_cobertura",
      faixas: [
        { rotulo: "Morte", capital: 296586.55 },
        { rotulo: "Morte Acidental", capital: 593173.11 },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("per capita e múltiplo salarial", () => {
    expect(esquemaCapital.safeParse({ tipo: "per_capita", valor: 18.91 }).success).toBe(true);
    expect(esquemaCapital.safeParse({ tipo: "multiplo_salarial", multiplo: 24 }).success).toBe(true);
  });

  /**
   * `nao_consta` existe para o modelo poder dizer que não achou, em vez de
   * escolher a forma menos errada e inventar um número.
   */
  it("não achou é uma resposta legítima", () => {
    expect(esquemaCapital.safeParse({ tipo: "nao_consta" }).success).toBe(true);
  });

  it("forma desconhecida é recusada", () => {
    expect(esquemaCapital.safeParse({ tipo: "por_idade", faixas: [] }).success).toBe(false);
  });

  it("faixa vazia é recusada: dizer 'por cargo' sem cargo nenhum não informa nada", () => {
    expect(esquemaCapital.safeParse({ tipo: "por_cargo", faixas: [] }).success).toBe(false);
  });

  it("capital negativo é recusado", () => {
    const r = esquemaCapital.safeParse({ tipo: "per_capita", valor: -1 });
    expect(r.success).toBe(false);
  });
});

describe("a leitura inteira", () => {
  it("uma leitura completa passa", () => {
    expect(esquemaApolice.safeParse(leitura()).success).toBe(true);
  });

  /**
   * Quase todo campo é anulável de propósito. A Tokio e a Porto não trazem taxa
   * nem limite de idade, e recusar a leitura por isso seria jogar fora oito
   * campos certos por causa de dois que o documento não tem.
   */
  it("taxa e limite de idade ausentes são normais", () => {
    const r = esquemaApolice.safeParse(
      leitura({ taxaPorMil: null, limiteDeIdade: null, capital: { tipo: "nao_consta" } }),
    );
    expect(r.success).toBe(true);
  });

  it("uma apólice em que nada foi lido ainda valida", () => {
    const r = esquemaApolice.safeParse({
      numeroApolice: null,
      numeroContrato: null,
      seguradora: null,
      produto: null,
      segurado: null,
      documentoSegurado: null,
      vigenciaInicio: null,
      vigenciaFim: null,
      taxaPorMil: null,
      limiteDeIdade: null,
      capital: { tipo: "nao_consta" },
      ilegivel: ["o PDF é uma imagem digitalizada"],
    });
    expect(r.success).toBe(true);
  });

  it("campo faltando é recusado — ausente não é o mesmo que nulo", () => {
    const sem = leitura();
    delete (sem as Record<string, unknown>).capital;
    expect(esquemaApolice.safeParse(sem).success).toBe(false);
  });

  it("limite de idade fracionado é recusado", () => {
    expect(esquemaApolice.safeParse(leitura({ limiteDeIdade: 70.5 })).success).toBe(false);
  });

  /**
   * Não há campo de confiança, e a ausência é deliberada: nas três leituras
   * reais o modelo devolveu `{}`. Campo que sempre volta vazio mente para quem
   * lê o código. O destaque na tela sai de "o modelo preencheu este campo".
   */
  it("não existe campo de confiança", () => {
    const r = esquemaApolice.safeParse(leitura());
    expect(r.success).toBe(true);
    if (r.success) expect("confianca" in r.data).toBe(false);
  });

  // O que o modelo de fato preenche: na Tokio devolveu "taxa por mil - não
  // consta". É o que evita a analista procurar no PDF um campo que não existe.
  it("ilegivel aceita a lista do que faltou", () => {
    const r = esquemaApolice.safeParse(
      leitura({ ilegivel: ["taxa por mil - não consta", "limite de idade - não consta"] }),
    );
    expect(r.success).toBe(true);
  });
});

describe("o agente", () => {
  it("é um só — a IA fica reservada à apólice", () => {
    expect(AGENTES).toEqual(["apolice"]);
    expect(agenteValido("apolice")).toBe(true);
    expect(agenteValido("triagem")).toBe(false);
    expect(agenteValido(42)).toBe(false);
  });

  it("o prompt diz as quatro formas de capital", () => {
    const texto = PROMPTS_PADRAO.apolice;
    for (const forma of ["por_cargo", "por_cobertura", "per_capita", "multiplo_salarial", "nao_consta"]) {
      expect(texto).toContain(forma);
    }
  });

  // A regra que mais importa: o modelo que tenta preencher tudo inventa a taxa
  // que a apólice não tem.
  it("o prompt manda não inventar", () => {
    expect(PROMPTS_PADRAO.apolice).toContain("NÃO INVENTE");
  });

  /**
   * A Prudential tem 27 páginas, e as últimas são condições gerais — texto
   * igual em toda apólice daquela seguradora, que não muda nada e custaria em
   * token.
   */
  it("lê só as primeiras páginas", () => {
    expect(PAGINAS_LIDAS).toBeGreaterThan(0);
    expect(PAGINAS_LIDAS).toBeLessThan(27);
  });
});

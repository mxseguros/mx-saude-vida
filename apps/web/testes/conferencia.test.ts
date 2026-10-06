import { describe, expect, it } from "vitest";

import { conferir, ROTULO_APONTAMENTO, type Informado } from "../lib/dominio/conferencia";
import type { LinhaDaPlanilha } from "../lib/dominio/planilha";

/**
 * O cruzamento entre o que o gestor informou e o que a planilha traz.
 *
 * CPFs sintéticos, iniciados em 999 — e válidos, porque a conferência casa por
 * CPF e um dígito errado faria o teste medir outra coisa.
 */

const ANA = "99999999050";
const BRUNO = "99999999131";
const CARLA = "99999999212";

const HOJE = "2026-09-20";

function naPlanilha(troca: Partial<LinhaDaPlanilha> = {}): LinhaDaPlanilha {
  return {
    numero: 2,
    nome: "Pessoa Da Planilha",
    cpf: ANA,
    nascimento: null,
    cargo: null,
    capital: null,
    setor: null,
    gestor: null,
    admissao: "2026-09-01",
    salario: null,
    problemas: [],
    ...troca,
  };
}

function informou(troca: Partial<Informado> = {}): Informado {
  return { tipo: "entrada", nome: "Pessoa Informada", documento: ANA, ...troca };
}

describe("o que confere", () => {
  it("CPF informado que a planilha traz, com admissão, não aponta nada", () => {
    const r = conferir([informou()], [naPlanilha()], HOJE);
    expect(r.apontamentos).toEqual([]);
    expect(r.conferem).toBe(1);
  });

  /**
   * A chave é o CPF, e não o nome: o nome é digitado por duas pessoas
   * diferentes — o gestor no celular e quem monta a folha —, e "José da Silva"
   * contra "Jose Silva" geraria apontamento em metade das linhas.
   */
  it("nome escrito diferente não atrapalha", () => {
    const r = conferir(
      [informou({ nome: "jose da silva" })],
      [naPlanilha({ nome: "JOSE SILVA" })],
      HOJE,
    );
    expect(r.apontamentos).toEqual([]);
  });
});

describe("informado e não está na planilha", () => {
  it("aponta, e diz se era entrada ou saída", () => {
    // A linha da planilha é de alguém ANTIGO, de propósito: com admissão no mês
    // ela própria viraria "não informada", e o teste mediria dois achados.
    const r = conferir([informou({ documento: BRUNO })], [naPlanilha({ admissao: "2019-03-10" })], HOJE);
    expect(r.apontamentos).toHaveLength(1);
    expect(r.apontamentos[0]?.tipo).toBe("fora_da_planilha");
    expect(r.apontamentos[0]?.mensagem).toMatch(/entrada/);
    expect(r.conferem).toBe(0);
  });

  it("saída também", () => {
    const r = conferir(
      [informou({ tipo: "saida", documento: BRUNO })],
      [naPlanilha({ admissao: "2019-03-10" })],
      HOJE,
    );
    expect(r.apontamentos[0]?.mensagem).toMatch(/saída/);
  });

  it("o CPF sai formatado: a analista vai procurar na planilha", () => {
    const r = conferir([informou({ documento: BRUNO })], [], HOJE);
    expect(r.apontamentos[0]?.documento).toBe("999.999.991-31");
  });
});

describe("na planilha e não foi informado", () => {
  /**
   * A regra que evita cem alertas num mês de duas entradas: a planilha é a FOTO
   * do mês, não a lista de quem mudou. Quase todo cliente manda a relação
   * inteira de vidas.
   */
  it("quem já estava na empresa NÃO é apontado", () => {
    const r = conferir([], [naPlanilha({ admissao: "2019-03-10" })], HOJE);
    expect(r.apontamentos).toEqual([]);
  });

  it("quem foi admitido no mês e não foi informado é apontado", () => {
    const r = conferir([], [naPlanilha({ admissao: "2026-09-14" })], HOJE);
    expect(r.apontamentos).toHaveLength(1);
    expect(r.apontamentos[0]?.tipo).toBe("fora_do_informado");
    expect(r.apontamentos[0]?.mensagem).toMatch(/14\/09/);
    expect(r.apontamentos[0]?.linha).toBe(2);
  });

  it("admitido no mês E informado não é apontado", () => {
    const r = conferir([informou()], [naPlanilha({ admissao: "2026-09-14" })], HOJE);
    expect(r.apontamentos).toEqual([]);
  });

  // Sem admissão não há como saber se é nova: a planilha que não exporta a
  // coluna não pode gerar um apontamento por vida.
  it("sem data de admissão, fica fora deste apontamento", () => {
    const r = conferir([], [naPlanilha({ admissao: null })], HOJE);
    expect(r.apontamentos).toEqual([]);
  });

  it("linha sem CPF fica fora do cruzamento", () => {
    const r = conferir([], [naPlanilha({ cpf: null, admissao: "2026-09-14" })], HOJE);
    expect(r.apontamentos).toEqual([]);
  });
});

describe("CPF informado duas vezes", () => {
  it("duas entradas com o mesmo CPF", () => {
    const r = conferir([informou(), informou()], [naPlanilha()], HOJE);
    const repetido = r.apontamentos.filter((a) => a.tipo === "cpf_repetido");
    expect(repetido).toHaveLength(1);
    expect(repetido[0]?.mensagem).toMatch(/2 vezes como entrada/);
  });

  /**
   * Entrada E saída do mesmo CPF é um caso REAL — saiu e voltou no mês, ou
   * trocou de contrato. A mensagem diz isso em vez de acusar erro: acusar o que
   * é normal ensina a analista a ignorar o alerta.
   */
  it("entrada e saída do mesmo CPF não é tratado como erro", () => {
    const r = conferir([informou(), informou({ tipo: "saida" })], [naPlanilha()], HOJE);
    const repetido = r.apontamentos.find((a) => a.tipo === "cpf_repetido");
    expect(repetido?.mensagem).toMatch(/saiu e voltou/);
  });
});

describe("entrada sem data de admissão", () => {
  it("aponta, e diz o que custa", () => {
    const r = conferir([informou()], [naPlanilha({ admissao: null })], HOJE);
    expect(r.apontamentos).toHaveLength(1);
    expect(r.apontamentos[0]?.tipo).toBe("sem_admissao");
    expect(r.apontamentos[0]?.mensagem).toMatch(/pró-rata/);
  });

  // Saída não tem admissão a conferir: a pessoa está saindo.
  it("saída sem admissão não é apontada", () => {
    const r = conferir([informou({ tipo: "saida" })], [naPlanilha({ admissao: null })], HOJE);
    expect(r.apontamentos).toEqual([]);
  });
});

describe("quem o gestor informou sem CPF", () => {
  /**
   * Contado e não apontado. O formulário aceita nome sem CPF de propósito, e
   * transformar isso em apontamento daria um alerta por pessoa num mês em que o
   * gestor não tinha os documentos à mão.
   */
  it("é contado, e não vira apontamento", () => {
    const r = conferir([informou({ documento: null })], [naPlanilha()], HOJE);
    expect(r.semDocumento).toBe(1);
    expect(r.apontamentos.filter((a) => a.tipo === "fora_da_planilha")).toEqual([]);
  });

  /**
   * E não faz a pessoa da planilha virar "não informada" por engano — é o pior
   * efeito possível: a analista cobraria do gestor alguém que ele já informou.
   */
  it("não faz a planilha apontar quem ele já informou", () => {
    const r = conferir(
      [informou({ documento: null, nome: "Pessoa Sem Documento" })],
      [naPlanilha({ admissao: "2026-09-14" })],
      HOJE,
    );
    // A linha vira "fora do informado" porque o CPF não casou — e é o certo:
    // sem CPF não dá para afirmar que é a mesma pessoa. O que a tela mostra é
    // "1 pessoa informada sem CPF", e a analista liga os dois.
    expect(r.apontamentos.map((a) => a.tipo)).toEqual(["fora_do_informado"]);
    expect(r.semDocumento).toBe(1);
  });
});

describe("a ordem e os rótulos", () => {
  it("o que muda a fatura vem primeiro, o provavelmente normal por último", () => {
    const r = conferir(
      [
        informou({ documento: BRUNO }),
        informou({ documento: CARLA }),
        informou({ documento: CARLA }),
        informou(),
      ],
      [naPlanilha({ admissao: null }), naPlanilha({ numero: 3, cpf: CARLA, admissao: "2026-09-02" })],
      HOJE,
    );

    expect(r.apontamentos.map((a) => a.tipo)).toEqual([
      "fora_da_planilha",
      "sem_admissao",
      "cpf_repetido",
    ]);
  });

  it("todo tipo tem rótulo", () => {
    for (const tipo of ["fora_da_planilha", "fora_do_informado", "cpf_repetido", "sem_admissao"] as const) {
      expect(ROTULO_APONTAMENTO[tipo]).toBeTruthy();
    }
  });
});

describe("nada disso impede conferir", () => {
  /**
   * A propriedade mais importante do arquivo: a conferência APONTA, nunca
   * bloqueia. Quem decide é a analista — a planilha pode ter chegado
   * incompleta, e um mês travado é pior que um mês com observação.
   */
  it("a função devolve achados, e nenhum deles é fatal", () => {
    const r = conferir(
      [informou({ documento: BRUNO }), informou({ documento: null })],
      [naPlanilha({ admissao: "2026-09-14" })],
      HOJE,
    );
    expect(r.apontamentos.length).toBeGreaterThan(0);
    // Não há campo de "bloqueia", e é deliberado: um booleano aqui seria a
    // primeira coisa que alguém ligaria a um `disabled` no botão.
    expect(Object.keys(r)).toEqual(["apontamentos", "conferem", "semDocumento"]);
  });

  it("sem informado e sem planilha, não aponta nada", () => {
    expect(conferir([], [], HOJE)).toEqual({ apontamentos: [], conferem: 0, semDocumento: 0 });
  });
});

import { describe, expect, it } from "vitest";

import {
  capitalDoFuncionario,
  esquemaDemissao,
  esquemaFuncionario,
  planoDeImportacao,
  resumir,
  type Funcionario,
} from "../lib/dominio/funcionario";
import type { LinhaDaPlanilha } from "../lib/dominio/planilha";
import { validar } from "../lib/dominio/validar";

const ANA = "99999999050";
const BRUNO = "99999999131";
const CARLA = "99999999212";

const func = (troca: Partial<Funcionario> = {}): Funcionario => ({
  id: "f1",
  nome: "Pessoa Exemplo",
  documento: ANA,
  nascimento: "1990-03-12",
  cargo: "Funcionário",
  salario: 3500,
  setor: null,
  gestor: null,
  admissao: "2025-01-01",
  saida: null,
  motivo: null,
  ...troca,
});

const linha = (troca: Partial<LinhaDaPlanilha> = {}): LinhaDaPlanilha => ({
  numero: 2,
  nome: "Pessoa Da Planilha",
  cpf: ANA,
  nascimento: null,
  cargo: null,
  capital: null,
  setor: null,
  gestor: null,
  admissao: null,
  salario: null,
  problemas: [],
  ...troca,
});

const porCargo = {
  tipo: "por_cargo" as const,
  faixas: [
    { rotulo: "Funcionário", capital: 23103.62 },
    { rotulo: "Sócio", capital: 173277.15 },
  ],
};

describe("capital pela apólice", () => {
  it("por cargo casa sem acento nem caixa", () => {
    expect(capitalDoFuncionario(porCargo, { cargo: "FUNCIONARIO", salario: null })).toBe(23103.62);
  });
  it("cargo que não está na apólice fica sem capital, não zero", () => {
    expect(capitalDoFuncionario(porCargo, { cargo: "Estagiário", salario: null })).toBeNull();
  });
  it("múltiplo salarial usa o salário", () => {
    expect(capitalDoFuncionario({ tipo: "multiplo_salarial", multiplo: 24 }, { cargo: null, salario: 1000 })).toBe(24000);
    expect(capitalDoFuncionario({ tipo: "multiplo_salarial", multiplo: 24 }, { cargo: null, salario: null })).toBeNull();
  });
  it("per capita é o mesmo para todos", () => {
    expect(capitalDoFuncionario({ tipo: "per_capita", valor: 10000 }, { cargo: null, salario: null })).toBe(10000);
  });
});

describe("o resumo do cabeçalho", () => {
  it("soma o capital dos ativos e calcula o prêmio pela taxa", () => {
    const r = resumir(
      [func(), func({ id: "f2", cargo: "Sócio" }), func({ id: "f3", saida: "2026-07-31" }), func({ id: "f4", cargo: "?" })],
      { capital: porCargo, taxaPorMil: 1.339977 },
    );
    expect(r).toMatchObject({ ativos: 3, demitidos: 1, capitalTotal: 196380.77, semCapital: 1 });
    expect(r.premioPrevisto).toBe(263.15);
  });
  it("sem taxa, sem prêmio", () => {
    expect(resumir([func()], { capital: porCargo, taxaPorMil: null }).premioPrevisto).toBeNull();
  });
});

describe("a importação", () => {
  it("separa novo, atualizar e readmitir pelo CPF", () => {
    const p = planoDeImportacao(
      [func(), func({ id: "f2", documento: BRUNO, saida: "2026-01-31" })],
      [linha(), linha({ numero: 3, cpf: BRUNO }), linha({ numero: 4, cpf: CARLA })],
    );
    expect(p.atualizar.map((i) => i.existenteId)).toEqual(["f1"]);
    expect(p.readmitir.map((i) => i.linha)).toEqual([3]);
    expect(p.novos.map((i) => i.linha)).toEqual([4]);
  });
  it("ignora sem CPF, CPF inválido e CPF repetido, dizendo por quê", () => {
    const p = planoDeImportacao([], [linha({ cpf: null }), linha({ numero: 3, cpf: "11111111111" }), linha({ numero: 4 }), linha({ numero: 5 })]);
    expect(p.ignorados.map((i) => i.motivo)).toEqual(["Sem CPF.", "CPF não confere.", "CPF repetido na planilha."]);
    expect(p.novos).toHaveLength(1);
  });
  // Planilha que não traz alguém não demite ninguém: tiraria cobertura de quem segue trabalhando.
  it("quem não está na planilha não é tocado", () => {
    const p = planoDeImportacao([func()], []);
    expect(p).toEqual({ novos: [], atualizar: [], readmitir: [], ignorados: [] });
  });
});

describe("os formulários", () => {
  it("cadastro converte data e salário", () => {
    const r = validar(esquemaFuncionario, {
      nome: "Pessoa Exemplo",
      documento: "999.999.990-50",
      nascimento: "12/03/1990",
      cargo: "Funcionário",
      salario: "R$ 3.500,00",
      setor: "",
      gestor: "",
      admissao: "01/01/2025",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.dados).toMatchObject({ documento: ANA, nascimento: "1990-03-12", salario: 3500, setor: null, admissao: "2025-01-01" });
  });
  it("demitir exige a data de saída", () => {
    expect(validar(esquemaDemissao, { saida: "", motivo: "" }).ok).toBe(false);
    expect(validar(esquemaDemissao, { saida: "31/10/2026", motivo: "Pedido de demissão" }).ok).toBe(true);
  });
});

import { describe, expect, it } from "vitest";

import {
  APOLICE_VAZIA,
  apoliceParaFormulario,
  capitalDoCadastro,
  esquemaApoliceDoCadastro,
  outroSegurado,
} from "../lib/dominio/apolice";
import { validar } from "../lib/dominio/validar";

const lida = {
  numero: "1099300020949/1",
  contrato: null,
  produto: "VG Express",
  vigenciaInicio: "2025-12-31",
  vigenciaFim: "2026-12-31",
  taxaPorMil: 1.339977,
  limiteDeIdade: 70,
  capital: { tipo: "por_cargo", faixas: [{ rotulo: "Funcionário", capital: 23103.62 }] },
};

describe("a apólice no cadastro do cliente", () => {
  it("o que o agente leu vira formulário e volta igual", () => {
    const form = apoliceParaFormulario(lida);
    expect(form.vigenciaInicio).toBe("31/12/2025");
    expect(form.taxaPorMil).toBe("1,339977");
    const r = validar(esquemaApoliceDoCadastro, { ...form, execucaoId: 7 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dados).toMatchObject({ vigenciaInicio: "2025-12-31", taxaPorMil: 1.339977, limiteDeIdade: 70, execucaoId: 7 });
    expect(capitalDoCadastro(r.dados)).toEqual(lida.capital);
  });

  it("sem número não salva", () => {
    expect(validar(esquemaApoliceDoCadastro, APOLICE_VAZIA).ok).toBe(false);
  });

  it("vigência ao contrário é recusada", () => {
    const r = validar(esquemaApoliceDoCadastro, { ...apoliceParaFormulario(lida), vigenciaFim: "01/01/2020" });
    expect(r.ok).toBe(false);
  });

  it("capital por cargo sem faixa é recusado", () => {
    const r = validar(esquemaApoliceDoCadastro, { ...apoliceParaFormulario(lida), faixas: [] });
    expect(r.ok).toBe(false);
  });

  it("capital ilegível no banco vira 'não consta', sem quebrar a tela", () => {
    expect(apoliceParaFormulario({ ...lida, capital: { lixo: true } }).forma).toBe("nao_consta");
  });

  it("acusa apólice de outro CNPJ, e só quando há o que comparar", () => {
    expect(outroSegurado("99.999.999/0001-91", "99999999000191")).toBe(false);
    expect(outroSegurado("99.999.998/0001-00", "99999999000191")).toBe(true);
    expect(outroSegurado(null, "99999999000191")).toBeNull();
  });
});

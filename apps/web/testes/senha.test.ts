import { describe, expect, it } from "vitest";

import { gerarSenha, problemaDaSenha, senhaValida } from "../lib/dominio/senha";

describe("senha definida pelo administrador (15/09)", () => {
  it("exige dez caracteres, letra e número, sem espaço", () => {
    expect(problemaDaSenha("curta1")).toMatch(/10 caracteres/);
    expect(problemaDaSenha("semnumeroaqui")).toMatch(/número/);
    expect(problemaDaSenha("1234567890123")).toMatch(/letra/);
    expect(problemaDaSenha("tem espaco 123")).toMatch(/espaço/);
    expect(problemaDaSenha("MxSaudeVida2026")).toBeNull();
    expect(senhaValida("MxSaudeVida2026")).toBe(true);
  });

  it("gera senha válida, ditável, com letra e número — determinística para um sorteio fixo", () => {
    let k = 0;
    const sorteio = (limite: number) => (k++ * 7) % limite;
    const senha = gerarSenha(sorteio);
    expect(senha).toHaveLength(12);
    expect(senhaValida(senha)).toBe(true);
    expect(senha).not.toMatch(/[0O1lI]/);
    // Outro sorteio, outra senha.
    expect(gerarSenha((limite) => (k++ * 13) % limite)).not.toBe(senha);
  });
});

import { describe, expect, it } from "vitest";

import {
  MENSAGEM_BLOQUEADO,
  MENSAGEM_SENHA_ERRADA,
  TENTATIVAS_ATE_BLOQUEAR,
  respostaDaSenhaErrada,
} from "../lib/dominio/bloqueio";

describe("bloqueio na terceira senha errada (17/09)", () => {
  it("são três tentativas, como na migration", () => {
    expect(TENTATIVAS_ATE_BLOQUEAR).toBe(3);
  });

  it("senha errada sem bloqueio: a mesma frase, exista o e-mail ou não — e sem contagem regressiva", () => {
    const existe = respostaDaSenhaErrada({ existe: true, bloqueado: false });
    const naoExiste = respostaDaSenhaErrada({ existe: false, bloqueado: false });
    expect(existe).toEqual({ mensagem: MENSAGEM_SENHA_ERRADA, bloqueou: false });
    expect(naoExiste).toEqual(existe);
    expect(MENSAGEM_SENHA_ERRADA).not.toMatch(/resta/i);
    expect(MENSAGEM_SENHA_ERRADA).toMatch(/três senhas erradas/);
  });

  it("na terceira, avisa do bloqueio e diz a quem recorrer", () => {
    const r = respostaDaSenhaErrada({ existe: true, bloqueado: true, user_id: "x" });
    expect(r).toEqual({ mensagem: MENSAGEM_BLOQUEADO, bloqueou: true });
    expect(MENSAGEM_BLOQUEADO).toMatch(/administrador/);
  });

  it("sem contagem (chave de administração ausente), o login responde como sempre", () => {
    expect(respostaDaSenhaErrada(null).bloqueou).toBe(false);
  });
});

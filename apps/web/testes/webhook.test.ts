import { describe, expect, it } from "vitest";

import {
  assinar,
  decodificarSegredo,
  verificarAssinatura,
} from "../lib/dominio/webhook";

const SEGREDO = "v1,whsec_" + Buffer.from("um-segredo-de-teste-bem-comprido").toString("base64");
const BYTES = decodificarSegredo(SEGREDO)!;
const CORPO = JSON.stringify({ user: { email: "a@exemplo.test" }, email_data: { token_hash: "x" } });
const AGORA = 1_760_000_000;

function cabecalhos(sobrescrever: Partial<{ id: string; timestamp: string; assinatura: string }> = {}) {
  const id = sobrescrever.id ?? "msg_1";
  const timestamp = sobrescrever.timestamp ?? String(AGORA);
  return {
    id,
    timestamp,
    assinatura: sobrescrever.assinatura ?? `v1,${assinar(BYTES, id, timestamp, CORPO)}`,
  };
}

/**
 * A rota do gancho de e-mail grava sem sessão. O que a protege é isto.
 */
describe("assinatura do gancho (Standard Webhooks)", () => {
  it("aceita a assinatura certa, com e sem o prefixo de versão no segredo", () => {
    expect(verificarAssinatura(cabecalhos(), CORPO, SEGREDO, AGORA)).toEqual({ ok: true });
    expect(verificarAssinatura(cabecalhos(), CORPO, SEGREDO.replace(/^v1,/, ""), AGORA)).toEqual({ ok: true });
  });

  it("recusa corpo alterado — um byte a mais e a assinatura não bate", () => {
    const r = verificarAssinatura(cabecalhos(), CORPO + " ", SEGREDO, AGORA);
    expect(r).toEqual({ ok: false, motivo: "assinatura" });
  });

  it("recusa pedido velho: capturado hoje não serve amanhã", () => {
    const r = verificarAssinatura(cabecalhos(), CORPO, SEGREDO, AGORA + 301);
    expect(r).toEqual({ ok: false, motivo: "fora_do_tempo" });
    // E do futuro também — relógio adiantado no atacante não ajuda.
    expect(verificarAssinatura(cabecalhos(), CORPO, SEGREDO, AGORA - 301).ok).toBe(false);
  });

  it("aceita qualquer uma das assinaturas do cabeçalho (rotação de segredo)", () => {
    const boa = cabecalhos().assinatura;
    const r = verificarAssinatura(
      cabecalhos({ assinatura: `v1,assinatura-velha ${boa}` }),
      CORPO,
      SEGREDO,
      AGORA,
    );
    expect(r).toEqual({ ok: true });
  });

  it("ignora versão desconhecida e cabeçalho faltando", () => {
    expect(
      verificarAssinatura(cabecalhos({ assinatura: "v2,qualquer" }), CORPO, SEGREDO, AGORA),
    ).toEqual({ ok: false, motivo: "assinatura" });
    expect(
      verificarAssinatura({ id: null, timestamp: String(AGORA), assinatura: "v1,x" }, CORPO, SEGREDO, AGORA),
    ).toEqual({ ok: false, motivo: "cabecalho" });
  });

  it("segredo mal formado não é aceito — e não passa por acidente", () => {
    expect(decodificarSegredo("segredo-sem-prefixo")).toBeNull();
    expect(verificarAssinatura(cabecalhos(), CORPO, "segredo-sem-prefixo", AGORA)).toEqual({
      ok: false,
      motivo: "segredo",
    });
  });

  it("o id entra na assinatura: trocar o id invalida", () => {
    const c = cabecalhos();
    expect(verificarAssinatura({ ...c, id: "outro" }, CORPO, SEGREDO, AGORA).ok).toBe(false);
  });
});

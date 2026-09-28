import { describe, expect, it } from "vitest";

import {
  enderecoDoRemetente,
  escolherProvedor,
  nomeDoRemetente,
} from "../lib/email/provedor";

const REMETENTE = "MX SaúdeVida <sistemas@exemplo.test>";

/**
 * A decisão de provedor mora num lugar só e é decidida por variável, não
 * por código. O que importa provar: a ordem (Graph, depois Resend) e que
 * incompleto não conta.
 */
describe("escolha do provedor de e-mail", () => {
  it("Microsoft Graph completo vence, e a caixa sai do remetente", () => {
    const p = escolherProvedor({
      EMAIL_REMETENTE: REMETENTE,
      MS_TENANT_ID: "tenant",
      MS_CLIENT_ID: "cliente",
      MS_CLIENT_SECRET: "segredo",
      RESEND_API_KEY: "re_tambem",
    });

    expect(p?.tipo).toBe("graph");
    if (p?.tipo !== "graph") return;
    expect(p.caixa).toBe("sistemas@exemplo.test");
    expect(p.remetente).toBe(REMETENTE);
  });

  it("Graph pela metade não conta: cai no Resend, ou em nada", () => {
    const metade = {
      EMAIL_REMETENTE: REMETENTE,
      MS_TENANT_ID: "tenant",
      MS_CLIENT_ID: "cliente",
      // sem MS_CLIENT_SECRET
    };
    expect(escolherProvedor(metade)).toBeNull();
    expect(escolherProvedor({ ...metade, RESEND_API_KEY: "re_x" })?.tipo).toBe("resend");
  });

  it("Graph sem endereço de verdade no remetente não vira provedor", () => {
    expect(
      escolherProvedor({
        EMAIL_REMETENTE: "MX SaúdeVida",
        MS_TENANT_ID: "t",
        MS_CLIENT_ID: "c",
        MS_CLIENT_SECRET: "s",
      }),
    ).toBeNull();
  });

  it("variável de SMTP sozinha não liga nada — o transporte saiu", () => {
    expect(
      escolherProvedor({
        EMAIL_REMETENTE: REMETENTE,
        SMTP_HOST: "smtp.office365.com",
        SMTP_USER: "a@b.c",
        SMTP_PASS: "x",
      }),
    ).toBeNull();
  });

  it("sem remetente não há provedor, por mais chave que exista", () => {
    // Sem "From" a Microsoft recusa e o Resend devolve 422 — melhor a tela
    // dizer "não configurado" do que o histórico encher de recusa.
    expect(
      escolherProvedor({
        MS_TENANT_ID: "t",
        MS_CLIENT_ID: "c",
        MS_CLIENT_SECRET: "s",
        RESEND_API_KEY: "re_x",
      }),
    ).toBeNull();
  });

  it("espaço em branco é ausência — a variável colada com espaço não conta", () => {
    expect(escolherProvedor({ EMAIL_REMETENTE: "  ", RESEND_API_KEY: "re_x" })).toBeNull();
  });

  it("extrai endereço e nome de 'Nome <endereco>'", () => {
    expect(enderecoDoRemetente(REMETENTE)).toBe("sistemas@exemplo.test");
    expect(enderecoDoRemetente("Sistemas@Exemplo.test")).toBe("sistemas@exemplo.test");
    expect(nomeDoRemetente(REMETENTE)).toBe("MX SaúdeVida");
    expect(nomeDoRemetente("sistemas@exemplo.test")).toBe("");
  });
});

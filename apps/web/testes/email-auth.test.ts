import { describe, expect, it } from "vitest";

import {
  TIPOS,
  mensagemDeAutenticacao,
  tipoConhecido,
  urlDeVerificacao,
} from "../lib/dominio/email-auth";

describe("e-mails de autenticação", () => {
  it("monta o link de verificação do Supabase, sem barra dupla", () => {
    const url = urlDeVerificacao(
      "https://abc.supabase.co/",
      "hash123",
      "magiclink",
      "https://saudevida-mx.vercel.app/auth/confirmar?destino=%2Flista",
    );
    expect(url.startsWith("https://abc.supabase.co/auth/v1/verify?")).toBe(true);
    expect(url).not.toContain("co//auth");
    const q = new URL(url).searchParams;
    expect(q.get("token")).toBe("hash123");
    expect(q.get("type")).toBe("magiclink");
    // O redirect_to volta inteiro, com a própria query dele.
    expect(q.get("redirect_to")).toBe("https://saudevida-mx.vercel.app/auth/confirmar?destino=%2Flista");
  });

  it("cada tipo tem assunto e chamada próprios, e o link aparece no texto e no html", () => {
    for (const tipo of TIPOS) {
      const m = mensagemDeAutenticacao(tipo, { url: "https://x.test/verify?token=abc", codigo: "123456" });
      expect(m.assunto.length).toBeGreaterThan(8);
      if (tipo === "reauthentication") {
        expect(m.texto).toContain("123456");
        expect(m.html).toContain("123456");
        expect(m.html).not.toContain("href=");
      } else {
        expect(m.texto).toContain("https://x.test/verify?token=abc");
        expect(m.html).toContain('href="https://x.test/verify?token=abc"');
      }
    }
  });

  it("escapa o que vai para o html — o link não pode fechar o atributo", () => {
    const m = mensagemDeAutenticacao("magiclink", { url: 'https://x.test/?a="><script>' });
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&quot;&gt;&lt;script&gt;");
  });

  it("só aceita os tipos que o Supabase manda", () => {
    expect(tipoConhecido("magiclink")).toBe(true);
    expect(tipoConhecido("recovery")).toBe(true);
    expect(tipoConhecido("qualquer")).toBe(false);
    expect(tipoConhecido(undefined)).toBe(false);
  });
});

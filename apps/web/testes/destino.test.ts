import { describe, expect, it } from "vitest";

import { DESTINO_PADRAO, caminhoSeguro, destinoSeguro } from "../lib/dominio/destino";

const PADRAO = { caminho: DESTINO_PADRAO, consulta: "" };

describe("destinoSeguro", () => {
  describe("preserva a query — o defeito que motivou o modulo", () => {
    it("separa caminho e busca", () => {
      expect(destinoSeguro("/controle?q=corte")).toEqual({
        caminho: "/controle",
        consulta: "?q=corte",
      });
    });

    it("preserva varios parametros", () => {
      expect(destinoSeguro("/controle?cia=zurich&atraso=1")).toEqual({
        caminho: "/controle",
        consulta: "?cia=zurich&atraso=1",
      });
    });

    it("caminho sem query fica com consulta vazia", () => {
      expect(destinoSeguro("/controle")).toEqual({
        caminho: "/controle",
        consulta: "",
      });
    });

    it("descarta '?' sozinho", () => {
      expect(destinoSeguro("/controle?")).toEqual({ caminho: "/controle", consulta: "" });
    });

    it("descarta o fragmento", () => {
      expect(destinoSeguro("/controle?q=a#topo")).toEqual({
        caminho: "/controle",
        consulta: "?q=a",
      });
    });
  });

  describe("nao deixa sair do site", () => {
    it("recusa URL absoluta", () => {
      expect(destinoSeguro("https://evil.com")).toEqual(PADRAO);
      expect(destinoSeguro("http://evil.com/lista")).toEqual(PADRAO);
    });

    it("recusa URL relativa a protocolo", () => {
      // `//evil.com` o navegador resolve como OUTRO dominio.
      expect(destinoSeguro("//evil.com")).toEqual(PADRAO);
      expect(destinoSeguro("//evil.com/controle?q=1")).toEqual(PADRAO);
    });

    it("recusa barra invertida, que varios navegadores normalizam para barra", () => {
      expect(destinoSeguro("/\\evil.com")).toEqual(PADRAO);
      expect(destinoSeguro("\\\\evil.com")).toEqual(PADRAO);
      expect(destinoSeguro("/lista\\@evil.com")).toEqual(PADRAO);
    });

    it("recusa caminho relativo", () => {
      expect(destinoSeguro("lista")).toEqual(PADRAO);
      expect(destinoSeguro("../admin")).toEqual(PADRAO);
    });

    it("recusa esquemas", () => {
      expect(destinoSeguro("javascript:alert(1)")).toEqual(PADRAO);
      expect(destinoSeguro("data:text/html,<script>")).toEqual(PADRAO);
    });
  });

  describe("entradas vazias", () => {
    it("cai no padrao", () => {
      expect(destinoSeguro("")).toEqual(PADRAO);
      expect(destinoSeguro("   ")).toEqual(PADRAO);
      expect(destinoSeguro(null)).toEqual(PADRAO);
      expect(destinoSeguro(undefined)).toEqual(PADRAO);
    });
  });

  describe("o resultado remonta a URL certa", () => {
    it("caminho e consulta reconstroem o endereco original", () => {
      // O teste que amarra a funcao ao uso real: e assim que a rota monta a
      // resposta, e e onde o `%3F` aparecia antes.
      const { caminho, consulta } = destinoSeguro("/controle?q=corte&atraso=1");
      const url = new URL("https://app.mx/auth/confirmar?code=abc");
      url.pathname = caminho;
      url.search = consulta;

      expect(url.href).toBe("https://app.mx/controle?q=corte&atraso=1");
      expect(url.href).not.toContain("%3F");
    });

    it("destino hostil remonta dentro da propria origem", () => {
      const { caminho, consulta } = destinoSeguro("//evil.com/roubar");
      const url = new URL("https://app.mx/auth/confirmar");
      url.pathname = caminho;
      url.search = consulta;

      expect(url.origin).toBe("https://app.mx");
      expect(url.href).toBe("https://app.mx/controle");
    });
  });
});

describe("caminhoSeguro", () => {
  it("junta caminho e consulta num texto so", () => {
    expect(caminhoSeguro("/controle?q=corte")).toBe("/controle?q=corte");
    expect(caminhoSeguro("/controle")).toBe("/controle");
  });

  it("NEUTRALIZA o redirect aberto do router.replace", () => {
    // `router.replace()` do Next aceita URL absoluta e sai do site. Este era o
    // buraco real: /entrar?destino=https://evil.com levava a pessoa para fora
    // logo apos ela digitar a senha certa.
    expect(caminhoSeguro("https://evil.com")).toBe(DESTINO_PADRAO);
    expect(caminhoSeguro("//evil.com/clone-do-login")).toBe(DESTINO_PADRAO);
    expect(caminhoSeguro("javascript:alert(1)")).toBe(DESTINO_PADRAO);
  });

  it("nunca devolve texto que o navegador leia como outro dominio", () => {
    for (const hostil of [
      "https://evil.com",
      "//evil.com",
      "/\evil.com",
      "\\evil.com",
      "http://evil.com",
      "javascript:alert(1)",
    ]) {
      const saida = caminhoSeguro(hostil);
      expect(saida.startsWith("/")).toBe(true);
      expect(saida.startsWith("//")).toBe(false);
      expect(saida).not.toContain("\\");
      expect(saida).not.toContain(":");
    }
  });
});

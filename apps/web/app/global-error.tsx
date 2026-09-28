"use client";

import { useEffect } from "react";

/**
 * Erro no layout raiz.
 *
 * O `error.tsx` cobre exceção dentro das páginas. Este cobre o caso em que o
 * próprio layout falha — a tipografia, o script de tema, o `<html>` — e por
 * isso ele **substitui o documento inteiro**: precisa trazer `<html>` e
 * `<body>` próprios, porque o layout que os produziria é justamente o que
 * quebrou. Sem ele, a pessoa cai na tela do Next, em inglês.
 *
 * Pelo mesmo motivo, o estilo vem embutido e não usa token nenhum: os tokens
 * moram no `globals.css` que o layout importa. Aqui não dá para supor que
 * qualquer coisa do sistema esteja de pé — nem a fonte, nem a paleta.
 *
 * E, como no `error.tsx`, o que aparece é o `digest`, nunca `error.message`:
 * a mensagem pode carregar o pedaço da consulta que falhou, com número de
 * apólice ou nome de segurado dentro.
 */
export default function ErroGlobal({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Falha no layout raiz:", error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: "#FFFDFB",
          color: "#484848",
          fontFamily: "system-ui, 'Segoe UI', Roboto, sans-serif",
          lineHeight: 1.6,
        }}
      >
        <main style={{ maxWidth: "420px", width: "100%" }}>
          <p
            style={{
              margin: 0,
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: ".12em",
              textTransform: "uppercase",
              color: "#6E7681",
            }}
          >
            MX SaúdeVida
          </p>

          <h1
            style={{
              margin: "6px 0 0",
              fontSize: "26px",
              lineHeight: 1.2,
              color: "#1B2430",
            }}
          >
            O sistema não conseguiu carregar
          </h1>

          <p style={{ margin: "10px 0 0", fontSize: "15px" }}>
            A falha aconteceu antes da tela existir, então nem a barra lateral
            abriu. Foi registrada. Tentar de novo costuma resolver quando é
            conexão; se repetir, avise o suporte com o código abaixo.
          </p>

          {error.digest ? (
            <p
              style={{
                margin: "16px 0 0",
                padding: "8px 12px",
                border: "1px solid #DFDFDF",
                borderRadius: "6px",
                background: "#F6F4EF",
                fontSize: "13px",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              Código: <b style={{ color: "#1B2430" }}>{error.digest}</b>
            </p>
          ) : null}

          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "20px",
              height: "44px",
              padding: "0 20px",
              border: 0,
              borderRadius: "6px",
              background: "#071B34",
              color: "#FFFFFF",
              fontSize: "14px",
              fontWeight: 600,
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            Tentar de novo
          </button>
        </main>
      </body>
    </html>
  );
}

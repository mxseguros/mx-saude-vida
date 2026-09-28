"use client";

import { useEffect, useState } from "react";

/**
 * Recolher e abrir o menu lateral.
 *
 * O estado mora em `data-menu` no `<html>` e no `localStorage`, exatamente
 * como o tema — e pela mesma razão: o script do `<head>` aplica antes da
 * hidratação, senão a sidebar abre com 232px e encolhe para 56px quando o
 * React entra, empurrando a esteira de lado a cada carregamento.
 *
 * Este componente não *controla* a largura, então: quem desenha é o CSS. Ele
 * só troca o atributo e mantém `aria-expanded` verdadeiro para quem navega por
 * leitor de tela.
 */

const CHAVE = "mx-menu";

export function AlternadorMenu() {
  const [recolhido, setRecolhido] = useState(false);
  const [montado, setMontado] = useState(false);

  // Lê do DOM, não do localStorage: o script do <head> já resolveu, e ler a
  // fonte que ele escreveu evita as duas respostas discordarem.
  useEffect(() => {
    setMontado(true);
    setRecolhido(
      document.documentElement.getAttribute("data-menu") === "recolhido",
    );
  }, []);

  function alternar() {
    const proximo = !recolhido;
    setRecolhido(proximo);

    const raiz = document.documentElement;

    if (proximo) {
      raiz.setAttribute("data-menu", "recolhido");
      try { localStorage.setItem(CHAVE, "recolhido"); } catch { /* vale só nesta aba */ }
    } else {
      raiz.removeAttribute("data-menu");
      try { localStorage.removeItem(CHAVE); } catch { /* vale só nesta aba */ }
    }
  }

  const rotulo = recolhido ? "Abrir o menu" : "Recolher o menu";

  return (
    <button
      type="button"
      onClick={alternar}
      title={rotulo}
      aria-label={rotulo}
      // `aria-expanded` só depois do mount: no servidor não dá para saber o
      // estado, e anunciar o valor errado é pior do que não anunciar.
      aria-expanded={montado ? !recolhido : undefined}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] text-[#8FA8C4] hover:bg-[rgba(202,227,247,.08)] hover:text-white"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none">
        {/* A seta aponta para onde o menu VAI, não para onde ele está. */}
        <path
          d={recolhido ? "M6 3.5 10.5 8 6 12.5" : "M10 3.5 5.5 8 10 12.5"}
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d={recolhido ? "M2.5 3v10" : "M13.5 3v10"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </button>
  );
}

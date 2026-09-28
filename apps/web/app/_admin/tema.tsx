"use client";

import { useEffect, useState } from "react";

/**
 * Alternador de tema (§5.3, F3-8). O admin é usado à noite.
 *
 * Três estados, e não dois: claro, escuro e "seguir o sistema". Quem nunca
 * tocou aqui fica no sistema — que é o padrão dos tokens em globals.css.
 *
 * A escolha vira `data-theme` no <html>, e o CSS já trata os três casos. O
 * valor é lido antes da hidratação por um script no <head> (ver layout), senão
 * a página pisca no tema errado por um quadro.
 */

type Tema = "sistema" | "claro" | "escuro";

const CHAVE = "mx-tema";

export function AlternadorTema() {
  const [tema, setTema] = useState<Tema>("sistema");
  const [montado, setMontado] = useState(false);

  // Só depois do mount: no servidor não existe localStorage, e renderizar um
  // estado diferente do cliente é erro de hidratação.
  useEffect(() => {
    setMontado(true);
    try {
      const guardado = localStorage.getItem(CHAVE) as Tema | null;
      if (guardado === "claro" || guardado === "escuro") setTema(guardado);
    } catch {
      // Navegador com armazenamento bloqueado: fica no sistema.
    }
  }, []);

  function escolher(novo: Tema) {
    setTema(novo);
    const raiz = document.documentElement;

    if (novo === "sistema") {
      raiz.removeAttribute("data-theme");
      try { localStorage.removeItem(CHAVE); } catch { /* segue no sistema */ }
      return;
    }

    raiz.setAttribute("data-theme", novo === "escuro" ? "dark" : "light");
    try { localStorage.setItem(CHAVE, novo); } catch { /* escolha vale só nesta aba */ }
  }

  const opcoes: { valor: Tema; rotulo: string; titulo: string }[] = [
    { valor: "claro", rotulo: "Claro", titulo: "Tema claro" },
    { valor: "sistema", rotulo: "Auto", titulo: "Seguir o sistema" },
    { valor: "escuro", rotulo: "Escuro", titulo: "Tema escuro" },
  ];

  return (
    <div
      role="group"
      aria-label="Tema"
      className="flex rounded-[6px] border border-[rgba(202,227,247,.22)] p-0.5"
    >
      {opcoes.map((o) => {
        const ativo = montado && tema === o.valor;
        return (
          <button
            key={o.valor}
            type="button"
            onClick={() => escolher(o.valor)}
            title={o.titulo}
            aria-pressed={ativo}
            className={
              "flex-1 rounded-[4px] px-2 py-1 text-[11px] font-[600] " +
              (ativo ? "bg-[rgba(202,227,247,.16)] text-white" : "text-[#8FA8C4] hover:text-white")
            }
          >
            {o.rotulo}
          </button>
        );
      })}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Aviso (toast) com Desfazer (§4.4 e §6).
 *
 * Toda movimentacao de fase tem Desfazer por 6 s. Sem Desfazer, arrastar
 * errado no board custa uma ida ao historico para entender o que aconteceu.
 */

type Estado = { mensagem: string; desfazer?: () => void } | null;

export function useAviso() {
  const [estado, setEstado] = useState<Estado>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const limpar = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const mostrar = useCallback(
    (mensagem: string, desfazer?: () => void) => {
      limpar();
      setEstado({ mensagem, desfazer });
      timer.current = setTimeout(() => setEstado(null), desfazer ? 6000 : 2600);
    },
    [limpar],
  );

  const fechar = useCallback(() => {
    limpar();
    setEstado(null);
  }, [limpar]);

  useEffect(() => limpar, [limpar]);

  return { estado, mostrar, fechar };
}

export function Aviso({
  estado,
  onFechar,
}: {
  estado: Estado;
  onFechar: () => void;
}) {
  if (!estado) return null;

  return (
    <div
      // "polite" e nao "assertive": o aviso informa, nao interrompe.
      role="status"
      aria-live="polite"
      className={
        "fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 " +
        "rounded-[8px] bg-[var(--heading)] px-4 py-3 text-[13.5px] text-[var(--bg)] " +
        "shadow-(--shadow-mx-3)"
      }
    >
      <span>{estado.mensagem}</span>
      {estado.desfazer ? (
        <button
          type="button"
          onClick={() => {
            estado.desfazer?.();
            onFechar();
          }}
          className="font-(family-name:--font-display) text-[12px] font-[700] uppercase tracking-[.1em] underline underline-offset-2"
        >
          Desfazer
        </button>
      ) : null}
    </div>
  );
}

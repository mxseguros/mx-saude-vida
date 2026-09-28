"use client";

import { useCallback, useRef, type ReactNode } from "react";

import { useCamadaSobreposta } from "./foco";

/**
 * Gaveta lateral de 460px (§4.4 e §5.4).
 *
 * O board fica visivel atras — e isso que separa a gaveta de um modal: a
 * analista nao perde o contexto da coluna de onde veio.
 *
 * Tela cheia no celular: 460px numa tela de 390px deixaria a ficha cortada, e
 * o board atras nao ajuda em nada num espaco desse.
 *
 * Esc, foco preso e rolagem do fundo travada vem de `useCamadaSobreposta`.
 */

export function Gaveta({
  aberta,
  titulo,
  onFechar,
  children,
  rodape,
}: {
  aberta: boolean;
  titulo: string;
  onFechar: () => void;
  children: ReactNode;
  rodape?: ReactNode;
}) {
  const painel = useRef<HTMLDivElement>(null);
  const fechar = useCallback(() => onFechar(), [onFechar]);

  useCamadaSobreposta(aberta, painel, fechar);

  if (!aberta) return null;

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onFechar}
        className="fixed inset-0 z-40 bg-[color-mix(in_srgb,var(--heading)_45%,transparent)]"
      />
      <div
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        className={
          // dvh, e nao vh: no Safari do iPhone a barra de endereco entra e sai
          // conforme a rolagem, e 100vh mede a tela SEM ela — o rodape da
          // gaveta, com os botoes, ficava escondido atras da barra.
          // `text-left` pelo mesmo motivo da modal: o painel herda o alinhamento
          // de onde foi montado, mesmo em `position: fixed`.
          "fixed inset-0 z-50 flex h-[100dvh] flex-col bg-surface text-left shadow-(--shadow-mx-3) " +
          "sm:inset-y-0 sm:left-auto sm:right-0 sm:w-full sm:max-w-[560px] sm:border-l sm:border-line"
        }
      >
        <header
          className="flex items-start justify-between gap-3 border-b border-line px-5 py-4"
          style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
        >
          <h2 className="min-w-0 text-[19px] font-[800] leading-tight">{titulo}</h2>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            // 44px de alvo: o × é o gesto de saída no celular e errá-lo
            // significa tocar num campo da ficha por baixo.
            className="-mt-2 -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-[4px] text-[20px] leading-none text-muted hover:text-heading"
          >
            &times;
          </button>
        </header>

        {/* px-5 ja da folga lateral suficiente para o anel de foco de 5px. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {rodape ? (
          <footer
            className="border-t border-line px-5 py-3"
            // A barra de gestos do iPhone fica por cima do rodape fixo.
            style={{ paddingBottom: "max(.75rem, env(safe-area-inset-bottom))" }}
          >
            {rodape}
          </footer>
        ) : null}
      </div>
    </>
  );
}

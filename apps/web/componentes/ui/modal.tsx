"use client";

import { useCallback, useRef, type ReactNode } from "react";

import { useCamadaSobreposta } from "./foco";

/**
 * Modal (§4.4).
 *
 * No MX SaúdeVida ele serve à mudança de status — "Relatar o status da próxima
 * etapa", que abre ANTES de a mudança acontecer — e à exclusão de coluna, que
 * exige destino. Nos dois casos o diálogo é o registro: nada muda sem ele.
 *
 * Foco preso, rolagem do fundo travada e Esc vêm de `useCamadaSobreposta`,
 * compartilhado com a gaveta e o menu do celular.
 */

export function Modal({
  aberto,
  titulo,
  descricao,
  onFechar,
  children,
  acoes,
  largura = "estreita",
}: {
  aberto: boolean;
  titulo: string;
  descricao?: string;
  onFechar: () => void;
  children?: ReactNode;
  acoes: ReactNode;
  /**
   * Largura do painel. `estreita` (420px) serve a uma pergunta ou a quatro
   * campos; um cadastro de onze campos espremido nela vira duas colunas de
   * 40px — foi o que aconteceu com o de parceiros.
   */
  largura?: "estreita" | "larga";
}) {
  const painel = useRef<HTMLDivElement>(null);
  const fechar = useCallback(() => onFechar(), [onFechar]);

  useCamadaSobreposta(aberto, painel, fechar);

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        aria-hidden="true"
        onClick={onFechar}
        className="absolute inset-0 bg-[color-mix(in_srgb,var(--heading)_45%,transparent)]"
      />
      <div
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        // max-h + rolagem interna: a modal de exclusão de coluna tem select e
        // texto de aviso, e num celular deitado (~380px de altura) ela passava
        // da tela — com os botões Cancelar e Confirmar do lado de fora, onde
        // não há como alcançá-los.
        className={
          // `text-left` EXPLICITO: a modal e montada onde o gatilho vive, e
          // `text-align` atravessa a arvore mesmo com o painel em
          // `position: fixed`. Aberta a partir da celula de acoes da tabela de
          // parceiros — que e `text-right` —, ela herdava o alinhamento e
          // titulo, descricao e TODOS os rotulos apareciam a direita, diferente
          // da mesma modal aberta pelo botao do topo.
          "relative flex max-h-[calc(100dvh-2rem)] w-full flex-col text-left " +
          (largura === "larga" ? "max-w-[640px] " : "max-w-[420px] ") +
          "rounded-[10px] border border-line bg-surface p-5 shadow-(--shadow-mx-3)"
        }
      >
        <h2 className="text-[19px] font-[800]">{titulo}</h2>
        {descricao ? (
          <p className="mt-1.5 text-[13.5px] text-muted">{descricao}</p>
        ) : null}

        {children ? (
          <div
            // `overflow-y-auto` corta o transbordo HORIZONTAL tambem, e o anel
            // de foco (3px + 2px de offset) aparecia comido nas laterais. A
            // folga da espaco ao anel; a margem negativa devolve o alinhamento.
            className="mt-4 -mx-1.5 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1.5"
          >
            {children}
          </div>
        ) : null}

        {/* Empilha no celular: dois botões lado a lado em 320px encolhem
            abaixo do alvo de toque, e o que se erra aqui é "Confirmar". */}
        {/* À ESQUERDA, ação principal primeiro — o mesmo padrão do rodapé do
            formulário de ticket. Modal alinhando à direita e formulário à
            esquerda faziam o olho procurar o botão em lugares diferentes na
            mesma tarefa. */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {acoes}
        </div>
      </div>
    </div>
  );
}

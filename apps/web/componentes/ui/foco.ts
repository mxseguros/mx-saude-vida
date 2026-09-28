"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * O comportamento comum de tudo que abre por cima da página: modal, gaveta e
 * menu do celular.
 *
 * Três coisas, e cada uma existe por um defeito concreto:
 *
 * FOCO PRESO      Sem isso, o Tab sai do diálogo e continua navegando pelos
 *                 links do board atrás — que estão visualmente cobertos. Quem
 *                 usa teclado ou leitor de tela some da caixa que abriu e não
 *                 tem como voltar, porque o que está sob o foco é invisível.
 *
 * ROLAGEM TRAVADA Sem isso, rolar dentro da gaveta no celular arrasta a página
 *                 de trás quando o conteúdo chega ao fim. A pessoa fecha a
 *                 gaveta e descobre que perdeu o lugar na esteira.
 *
 * ESC E RETORNO   Esc fecha, e o foco volta para quem abriu — senão a
 *                 navegação por teclado recomeça do topo do documento a cada
 *                 ticket aberto e fechado.
 */

/** O que o navegador considera focável, na ordem em que ele mesmo tabula. */
const FOCAVEIS = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function useCamadaSobreposta(
  aberta: boolean,
  painel: RefObject<HTMLElement | null>,
  onFechar: () => void,
): void {
  /*
   * `onFechar` numa REF, e fora das dependencias.
   *
   * Quem chama passa uma arrow inline — `onFechar={() => setAberto(false)}` —,
   * que e uma funcao nova a cada render. Como dependencia, ela refazia o
   * efeito a cada render, e o efeito MOVE O FOCO: a limpeza devolve o foco ao
   * elemento anterior e o corpo o traz de volta para o painel.
   *
   * Enquanto nada reagia a foco, isso passava despercebido. No dia em que um
   * campo ganhou validacao no `onBlur`, virou laco infinito: render -> efeito
   * -> foco muda -> blur -> setState -> render. O React derrubava a tela com
   * "Maximum update depth exceeded".
   *
   * Com a ref, o efeito roda quando a camada ABRE ou FECHA, que e quando ele
   * tem o que fazer, e o Esc continua chamando sempre a versao mais recente.
   */
  const fechar = useRef(onFechar);
  fechar.current = onFechar;

  useEffect(() => {
    if (!aberta) return;

    const anterior = document.activeElement as HTMLElement | null;
    painel.current?.focus();

    // Guarda o valor que estava lá: sobrescrever com "" no fim apagaria um
    // overflow que outra camada aberta ainda precisa.
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") {
        fechar.current();
        return;
      }

      if (evento.key !== "Tab") return;

      const caixa = painel.current;
      if (!caixa) return;

      const focaveis = Array.from(
        caixa.querySelectorAll<HTMLElement>(FOCAVEIS),
      ).filter((elemento) => elemento.offsetParent !== null || elemento === caixa);

      // Caixa sem nada focável: o próprio painel segura o foco (ele tem
      // tabIndex -1), senão o Tab escaparia para a página de trás.
      if (focaveis.length === 0) {
        evento.preventDefault();
        caixa.focus();
        return;
      }

      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      const atual = document.activeElement;

      if (evento.shiftKey && (atual === primeiro || atual === caixa)) {
        evento.preventDefault();
        ultimo?.focus();
      } else if (!evento.shiftKey && atual === ultimo) {
        evento.preventDefault();
        primeiro?.focus();
      }
    }

    document.addEventListener("keydown", aoTeclar);

    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflowAnterior;
      anterior?.focus();
    };
  }, [aberta, painel]);
}

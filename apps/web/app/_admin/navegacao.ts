import type { NomeDoIcone } from "./icones";

/**
 * Os itens do menu, num lugar só.
 *
 * A sidebar do desktop e o menu do celular renderizam diferente, mas navegam
 * para o mesmo lugar. Com duas listas, o dia em que alguém acrescentasse uma
 * tela ela apareceria só numa das duas — e a que ficaria de fora seria sempre
 * a do celular, que é a que ninguém testa.
 *
 * Dado puro: sem I/O, sem React. Serve aos dois lados da fronteira
 * servidor/cliente sem `"use client"` contaminar nada.
 */

export type ItemMenu = {
  href: string;
  rotulo: string;
  /** Quantos itens esperam a pessoa (ex.: planilhas para conferir). */
  contagem?: number;
  /** Quantos estão com prazo vencido: a contagem vira medalha vermelha. */
  atencao?: number;
  /** Desenhado quando o menu está recolhido — no trilho não cabe rótulo. */
  icone: NomeDoIcone;
};

export type GrupoMenu = {
  titulo: string;
  itens: ItemMenu[];
};

export function montarMenu(contadores?: { pendentes?: number; vencidos?: number }): GrupoMenu[] {
  return [
    {
      titulo: "Operação",
      itens: [
        {
          href: "/controle",
          rotulo: "Controle mensal",
          contagem: contadores?.pendentes,
          atencao: contadores?.vencidos,
          icone: "controle",
        },
        { href: "/clientes", rotulo: "Clientes", icone: "clientes" },
      ],
    },
  ];
}

/**
 * Qual item do menu fica destacado.
 *
 * Mora aqui, no modulo puro, e nao no componente: e regra, e regra tem teste.
 *
 * O casamento e por SEGMENTO, nao por prefixo de texto. `/clientes/novo`
 * mantem "Clientes" destacado, mas `/clientes-antigos` nao destaca "Clientes".
 */
export function rotaAtiva(atual: string, href: string): boolean {
  return atual === href || atual.startsWith(`${href}/`);
}

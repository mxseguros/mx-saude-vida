/**
 * A fronteira entre o banco (ingles) e o aplicativo (portugues).
 *
 * Este e o UNICO arquivo que conhece os nomes das colunas. Se o schema mudar,
 * a quebra acontece aqui e o compilador aponta o resto.
 */

import type { Papel, Pessoa } from "./tipos";

/* --------------------------------------------------------------------------
   Papel: `analyst` | `reader` | `admin` no banco
   -------------------------------------------------------------------------- */

/**
 * Valor desconhecido vira `leitura`, o papel que nao altera nada: um enum novo
 * no banco que o aplicativo ainda nao conhece nunca pode virar permissao a mais.
 */
export function paraPapel(valor: string): Papel {
  if (valor === "admin") return "admin";
  if (valor === "analyst") return "analista";
  return "leitura";
}

export function dePapel(papel: Papel): "admin" | "analyst" | "reader" {
  if (papel === "admin") return "admin";
  if (papel === "analista") return "analyst";
  return "reader";
}

/* --------------------------------------------------------------------------
   Pessoa da equipe
   -------------------------------------------------------------------------- */

export type LinhaPerfil = {
  id: string;
  full_name: string;
  initials: string | null;
  role: string;
};

export function paraPessoa(linha: LinhaPerfil | null): Pessoa | null {
  if (!linha) return null;
  return {
    id: linha.id,
    nome: linha.full_name,
    iniciais: linha.initials ?? "?",
    papel: paraPapel(linha.role),
  };
}

/**
 * A fronteira entre o banco (ingles) e o aplicativo (portugues).
 *
 * Este e o UNICO arquivo que conhece os nomes das colunas. Se o schema mudar,
 * a quebra acontece aqui e o compilador aponta o resto.
 */

import type { Passo } from "./controle";
import type { Canal } from "./mensagem";
import type { ModeloDeMensagem } from "./controle";
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

/* --------------------------------------------------------------------------
   Canal de aviso: `both` no banco, `ambos` no aplicativo
   -------------------------------------------------------------------------- */

export function paraCanal(valor: string): Canal {
  if (valor === "email") return "email";
  if (valor === "both") return "ambos";
  return "whatsapp";
}

export function deCanal(canal: Canal): "whatsapp" | "email" | "both" {
  return canal === "ambos" ? "both" : canal;
}

/* --------------------------------------------------------------------------
   Passo do mes: `spreadsheet_received` no banco, `planilha_recebida` aqui
   -------------------------------------------------------------------------- */

const PASSO_DO_BANCO: Record<string, Passo> = {
  inform: "informar",
  spreadsheet_received: "planilha_recebida",
  checked: "conferida",
  cutoff: "corte",
  invoice: "boleto",
  due: "vencimento",
  done: "concluida",
};

const PASSO_PARA_O_BANCO: Record<Passo, string> = {
  informar: "inform",
  planilha_recebida: "spreadsheet_received",
  conferida: "checked",
  corte: "cutoff",
  boleto: "invoice",
  vencimento: "due",
  concluida: "done",
};

/**
 * Passo desconhecido vira `informar`, o comeco do mes: um enum novo que o
 * aplicativo ainda nao conhece nunca pode virar "concluida" e sumir da fila.
 */
export function paraPasso(valor: string): Passo {
  return PASSO_DO_BANCO[valor] ?? "informar";
}

export function dePasso(passo: Passo): string {
  return PASSO_PARA_O_BANCO[passo];
}

/* --------------------------------------------------------------------------
   Modelo de mensagem: `correction` no banco, `correcao` aqui
   -------------------------------------------------------------------------- */

const MODELO_DO_BANCO: Record<string, ModeloDeMensagem> = {
  inform: "informar",
  cutoff: "corte",
  invoice: "boleto",
  due: "vencimento",
  correction: "correcao",
};

const MODELO_PARA_O_BANCO: Record<ModeloDeMensagem, string> = {
  informar: "inform",
  corte: "cutoff",
  boleto: "invoice",
  vencimento: "due",
  correcao: "correction",
};

export function paraModelo(valor: string): ModeloDeMensagem {
  return MODELO_DO_BANCO[valor] ?? "informar";
}

export function deModelo(modelo: ModeloDeMensagem): string {
  return MODELO_PARA_O_BANCO[modelo];
}

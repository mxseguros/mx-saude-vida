/**
 * A fronteira entre o banco (ingles) e o aplicativo (portugues).
 *
 * Este e o UNICO arquivo que conhece os nomes das colunas. Se o schema mudar,
 * a quebra acontece aqui e o compilador aponta o resto.
 */

import type { Passo } from "./controle";
import type { Canal } from "./mensagem";
import type { ModeloDeMensagem } from "./controle";
import type { Movimento, QuemDigitou, TipoDeMovimento } from "./coleta";
import type { Funcionario } from "./funcionario";
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

/* --------------------------------------------------------------------------
   Movimentação: `entry`/`exit` e `manager`/`staff` no banco
   -------------------------------------------------------------------------- */

export type LinhaMovimento = {
  id: number;
  kind: string;
  full_name: string;
  document: string | null;
  birth_date?: string | null;
  job_title?: string | null;
  salary?: string | number | null;
  source: string;
};

/**
 * Tipo desconhecido vira `entrada`, e quem digitou vira `equipe`.
 *
 * O padrão é o lado SEGURO de cada um. Um `kind` novo no banco apareceria como
 * entrada — a tela mostra a pessoa, e a analista vê que algo está errado. Virar
 * `gestor` por engano seria pior: a conferência da Fase 5 cruza com a planilha
 * só o que o GESTOR informou, e uma linha da equipe entrando nesse cruzamento
 * geraria apontamento que ninguém pode resolver.
 */
export function paraMovimento(linha: LinhaMovimento): Movimento {
  return {
    tipo: linha.kind === "exit" ? "saida" : "entrada",
    nome: linha.full_name,
    documento: linha.document,
    nascimento: linha.birth_date ?? null,
    cargo: linha.job_title ?? null,
    // `numeric` chega como texto pelo PostgREST.
    salario: linha.salary === null || linha.salary === undefined ? null : Number(linha.salary),
    porQuem: linha.source === "manager" ? "gestor" : "equipe",
  };
}

export function deTipoDeMovimento(tipo: TipoDeMovimento): "entry" | "exit" {
  return tipo === "saida" ? "exit" : "entry";
}

export function deQuemDigitou(quem: QuemDigitou): "manager" | "staff" {
  return quem === "gestor" ? "manager" : "staff";
}

/* --------------------------------------------------------------------------
   Funcionário: `employees` no banco
   -------------------------------------------------------------------------- */

export type LinhaFuncionario = {
  id: string;
  full_name: string;
  document: string | null;
  birth_date: string | null;
  job_title: string | null;
  salary: string | number | null;
  sector: string | null;
  manager_name: string | null;
  hired_at: string | null;
  dismissed_at: string | null;
  dismissal_reason: string | null;
};

export const COLUNAS_FUNCIONARIO =
  "id, full_name, document, birth_date, job_title, salary, sector, manager_name, hired_at, dismissed_at, dismissal_reason";

export function paraFuncionario(l: LinhaFuncionario): Funcionario {
  return {
    id: l.id,
    nome: l.full_name,
    documento: l.document,
    nascimento: l.birth_date,
    cargo: l.job_title,
    salario: l.salary === null ? null : Number(l.salary),
    setor: l.sector,
    gestor: l.manager_name,
    admissao: l.hired_at,
    saida: l.dismissed_at,
    motivo: l.dismissal_reason,
  };
}

export function deFuncionario(d: Omit<Funcionario, "id" | "saida" | "motivo">) {
  return {
    full_name: d.nome,
    document: d.documento,
    birth_date: d.nascimento,
    job_title: d.cargo,
    salary: d.salario,
    sector: d.setor,
    manager_name: d.gestor,
    hired_at: d.admissao,
  };
}

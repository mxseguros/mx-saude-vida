/**
 * Tipos do aplicativo — em portugues.
 *
 * O banco e a API falam ingles (`clients`, `due_date`, `step`), o aplicativo
 * fala portugues. A traducao acontece num lugar so: `mapear.ts`. Nenhum
 * componente conhece `due_date`; quando o schema mudar, quebra la e o
 * compilador aponta o resto.
 */

/**
 * Perfis da equipe da MX.
 *
 * `admin` configura (usuarios, mensagens, inativar cliente), `analista` opera
 * o Controle e os cadastros, `leitura` consulta e baixa, sem alterar nada.
 */
export type Papel = "analista" | "leitura" | "admin";

export const PAPEIS: readonly Papel[] = ["admin", "analista", "leitura"] as const;

export const ROTULO_PAPEL: Record<Papel, string> = {
  admin: "Administrador",
  analista: "Analista",
  leitura: "Leitura",
};

export type Pessoa = {
  id: string;
  nome: string;
  iniciais: string;
  papel: Papel;
};

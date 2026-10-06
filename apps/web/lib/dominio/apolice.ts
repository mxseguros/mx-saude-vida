import { z } from "zod";

import { dataBrParaIso, isoParaDataBr, valorParaNumero } from "./mascaras";
import { limparDocumento } from "./documento";

const faixa = z.object({
  /** "Funcionário", "Sócio", "Morte", "Morte Acidental". */
  rotulo: z.string(),
  capital: z.number().nonnegative(),
});

/**
 * As quatro formas de capital que as apólices reais usam.
 *
 * `nao_consta` existe para o modelo poder dizer que não achou, em vez de
 * escolher a forma menos errada e inventar um número.
 */
export const esquemaCapital = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("por_cargo"), faixas: z.array(faixa).min(1) }),
  z.object({ tipo: z.literal("por_cobertura"), faixas: z.array(faixa).min(1) }),
  z.object({ tipo: z.literal("per_capita"), valor: z.number().nonnegative() }),
  z.object({ tipo: z.literal("multiplo_salarial"), multiplo: z.number().positive() }),
  z.object({ tipo: z.literal("nao_consta") }),
]);

export type Capital = z.infer<typeof esquemaCapital>;

/* --------------------------------------------------------------------------
   O cadastro da apólice na ficha do cliente
   -------------------------------------------------------------------------- */


export const FORMAS_DE_CAPITAL = ["por_cargo", "por_cobertura", "per_capita", "multiplo_salarial", "nao_consta"] as const;
export type FormaDeCapital = (typeof FORMAS_DE_CAPITAL)[number];

export const ROTULO_FORMA: Record<FormaDeCapital, string> = {
  por_cargo: "Escalonado por cargo",
  por_cobertura: "Por cobertura",
  per_capita: "Per capita fixo",
  multiplo_salarial: "Múltiplo salarial",
  nao_consta: "Não consta",
};

/** Como a tela guarda a apólice: tudo texto, do jeito que se digita. */
export type ApoliceNoFormulario = {
  numero: string;
  contrato: string;
  produto: string;
  vigenciaInicio: string;
  vigenciaFim: string;
  taxaPorMil: string;
  limiteDeIdade: string;
  forma: FormaDeCapital;
  faixas: { rotulo: string; capital: string }[];
  valor: string;
  multiplo: string;
};

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const opcional = (max: number) =>
  z.preprocess(texto, z.string().max(max, `Máximo de ${max} caracteres.`)).transform((v) => v || null);
const data = z
  .preprocess(texto, z.string().refine((v) => v === "" || dataBrParaIso(v) !== null, { message: "Data inválida: use dd/mm/aaaa." }))
  .transform((v) => (v ? dataBrParaIso(v) : null));
const numero = (mensagem: string) =>
  z.preprocess(texto, z.string().refine((v) => v === "" || valorParaNumero(v) !== null, { message: mensagem }));

/** O mesmo esquema na tela e na rota (regra 3). */
export const esquemaApoliceDoCadastro = z
  .object({
    numero: z.preprocess(texto, z.string().min(3, "Informe o número da apólice.").max(60)),
    contrato: opcional(60),
    produto: opcional(120),
    vigenciaInicio: data,
    vigenciaFim: data,
    taxaPorMil: numero("Taxa inválida.").transform((v) => (v ? valorParaNumero(v) : null)),
    limiteDeIdade: z
      .preprocess(texto, z.string().refine((v) => v === "" || (/^\d+$/.test(v) && Number(v) >= 14 && Number(v) <= 120), { message: "Idade entre 14 e 120." }))
      .transform((v) => (v ? Number(v) : null)),
    forma: z.enum(FORMAS_DE_CAPITAL),
    faixas: z.array(z.object({ rotulo: z.preprocess(texto, z.string().min(1, "Informe o cargo ou a cobertura.")), capital: numero("Valor inválido.") })),
    valor: numero("Valor inválido."),
    multiplo: numero("Múltiplo inválido."),
    /** A execução do agente que preencheu, para marcar o aceite. */
    execucaoId: z.number().int().positive().nullable().default(null),
  })
  .refine((a) => !a.vigenciaInicio || !a.vigenciaFim || a.vigenciaFim >= a.vigenciaInicio, {
    message: "O fim da vigência é antes do início.",
    path: ["vigenciaFim"],
  })
  .refine((a) => (a.forma !== "por_cargo" && a.forma !== "por_cobertura") || a.faixas.length > 0, {
    message: "Informe ao menos uma faixa.",
    path: ["faixas"],
  })
  .refine((a) => a.forma !== "per_capita" || valorParaNumero(a.valor) !== null, { message: "Informe o valor.", path: ["valor"] })
  .refine((a) => a.forma !== "multiplo_salarial" || valorParaNumero(a.multiplo) !== null, {
    message: "Informe o múltiplo.",
    path: ["multiplo"],
  });

export type ApoliceValidada = z.infer<typeof esquemaApoliceDoCadastro>;

/** O capital no formato do banco (`policies.capital_rule`). */
export function capitalDoCadastro(a: ApoliceValidada): Capital {
  if (a.forma === "por_cargo" || a.forma === "por_cobertura") {
    return { tipo: a.forma, faixas: a.faixas.map((f) => ({ rotulo: f.rotulo, capital: valorParaNumero(f.capital) ?? 0 })) };
  }
  if (a.forma === "per_capita") return { tipo: "per_capita", valor: valorParaNumero(a.valor) ?? 0 };
  if (a.forma === "multiplo_salarial") return { tipo: "multiplo_salarial", multiplo: valorParaNumero(a.multiplo) ?? 0 };
  return { tipo: "nao_consta" };
}

export const APOLICE_VAZIA: ApoliceNoFormulario = {
  numero: "",
  contrato: "",
  produto: "",
  vigenciaInicio: "",
  vigenciaFim: "",
  taxaPorMil: "",
  limiteDeIdade: "",
  forma: "nao_consta",
  faixas: [],
  valor: "",
  multiplo: "",
};

const decimal = (n: number) => String(n).replace(".", ",");

/** O que veio do banco ou do agente, como a tela mostra. */
export function apoliceParaFormulario(a: {
  numero: string | null;
  contrato: string | null;
  produto: string | null;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  taxaPorMil: number | null;
  limiteDeIdade: number | null;
  capital: unknown;
}): ApoliceNoFormulario {
  const capital = esquemaCapital.safeParse(a.capital);
  const c = capital.success ? capital.data : ({ tipo: "nao_consta" } as const);
  return {
    numero: a.numero ?? "",
    contrato: a.contrato ?? "",
    produto: a.produto ?? "",
    vigenciaInicio: isoParaDataBr(a.vigenciaInicio),
    vigenciaFim: isoParaDataBr(a.vigenciaFim),
    taxaPorMil: a.taxaPorMil === null ? "" : decimal(a.taxaPorMil),
    limiteDeIdade: a.limiteDeIdade === null ? "" : String(a.limiteDeIdade),
    forma: c.tipo,
    faixas: "faixas" in c ? c.faixas.map((f) => ({ rotulo: f.rotulo, capital: decimal(f.capital) })) : [],
    valor: c.tipo === "per_capita" ? decimal(c.valor) : "",
    multiplo: c.tipo === "multiplo_salarial" ? decimal(c.multiplo) : "",
  };
}

/**
 * A apólice lida é de OUTRO segurado?
 *
 * O erro mais caro desta tela: subir o PDF do cliente errado e salvar. `null`
 * quando o documento não veio — sem leitura, sem acusação.
 */
export function outroSegurado(lido: string | null, doCadastro: string): boolean | null {
  const digitos = limparDocumento(lido ?? "");
  if (!digitos) return null;
  return digitos !== limparDocumento(doCadastro);
}

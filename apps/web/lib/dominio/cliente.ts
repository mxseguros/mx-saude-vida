import { z } from "zod";

import { documentoValido, normalizarDocumento } from "./documento";
import { EMAIL } from "./mascaras";
import { digitosDoTelefone } from "./telefone";

/**
 * O cadastro do cliente: empresa, produto, regras do mês e canal de aviso.
 *
 * É este esquema que decide se um cliente entra no Controle. As quatro datas
 * são DIA DO MÊS, e não data: elas se repetem todo mês, e a data de cada
 * competência é calculada na abertura (ver `controle.ts`).
 *
 * Puro, sem I/O: o mesmo esquema no navegador e na rota. A rota recusa sozinha
 * e devolve todos os erros de uma vez.
 */

const texto = (valor: unknown) => (typeof valor === "string" ? valor.trim() : "");

/** Campo de texto opcional: vazio vira `null`, nunca string vazia no banco. */
const opcional = (max: number) =>
  z.preprocess(texto, z.string().max(max, `Máximo de ${max} caracteres.`)).transform((v) => v || null);

export const PRODUTOS = ["health", "life", "dental", "global", "transport", "group_life"] as const;
export type Produto = (typeof PRODUTOS)[number];

export const ROTULO_PRODUTO: Record<Produto, string> = {
  health: "Saúde",
  life: "Vida",
  dental: "Odonto",
  global: "Global",
  transport: "Transporte",
  group_life: "Vida em grupo",
};

export const CANAIS = ["whatsapp", "email", "ambos"] as const;

/** Dia do mês: 1 a 31. Campo vazio vira `null` (apólice sem aquela data). */
const diaDoMes = (rotulo: string) =>
  z.preprocess(
    (valor) => {
      const bruto = texto(valor).replace(/\D/g, "");
      return bruto === "" ? null : Number(bruto);
    },
    z
      .number({ invalid_type_error: `${rotulo}: informe um dia do mês.` })
      .int(`${rotulo}: informe um dia do mês.`)
      .min(1, `${rotulo}: o dia vai de 1 a 31.`)
      .max(31, `${rotulo}: o dia vai de 1 a 31.`)
      .nullable(),
  );

const diaObrigatorio = (rotulo: string) =>
  diaDoMes(rotulo).refine((v): v is number => v !== null, { message: `${rotulo} é obrigatório.` });

export const esquemaCliente = z
  .object({
    razaoSocial: z.preprocess(texto, z.string().min(3, "Informe a razão social.").max(200)),
    nomeFantasia: opcional(120),

    documento: z.preprocess(
      (valor) => normalizarDocumento(texto(valor)),
      z
        .string()
        .min(1, "Informe o CNPJ.")
        .refine((d) => documentoValido(d), { message: "CNPJ ou CPF inválido." }),
    ),

    seguradoraId: z.preprocess(
      (valor) => {
        const bruto = texto(valor);
        return bruto === "" ? null : Number(bruto);
      },
      z.number().int().positive().nullable(),
    ),

    produto: z.enum(PRODUTOS, { errorMap: () => ({ message: "Escolha o tipo de seguro." }) }),
    observacoes: opcional(500),

    // Regras do mês.
    informarDia: diaDoMes("Informar até"),
    corteDia: diaDoMes("Corte"),
    boletoDia: diaObrigatorio("Emissão do boleto"),
    vencimentoDia: diaObrigatorio("Vencimento"),

    // Canal de aviso.
    canal: z.enum(CANAIS, { errorMap: () => ({ message: "Escolha o canal de aviso." }) }),
    gestorNome: opcional(120),

    gestorCelular: z.preprocess(
      (valor) => digitosDoTelefone(texto(valor)),
      z.string().refine((d) => d === "" || (d.length >= 10 && d.length <= 13), {
        message: "Celular incompleto: DDD e número.",
      }),
    ).transform((v) => v || null),

    gestorEmail: z.preprocess(
      (valor) => texto(valor).toLowerCase(),
      z.string().refine((e) => e === "" || EMAIL.test(e), { message: "E-mail inválido." }),
    ).transform((v) => v || null),
  })
  // Quem tem data de informar tem data de corte: sem uma das duas, o mês não
  // sabe quando cobrar nem quando fecha. Apólice sem movimentação deixa as
  // DUAS em branco e começa no boleto.
  .refine((c) => (c.informarDia === null) === (c.corteDia === null), {
    message: 'Preencha "Informar até" e "Corte" juntos, ou deixe os dois em branco.',
    path: ["corteDia"],
  })
  // O canal precisa de por onde falar. Sem isto, o cliente entra no Controle e
  // nenhuma mensagem tem destino — e ninguém descobre até o mês virar.
  .refine((c) => c.canal === "email" || c.gestorCelular !== null, {
    message: "Para avisar por WhatsApp, informe o celular do gestor.",
    path: ["gestorCelular"],
  })
  .refine((c) => c.canal === "whatsapp" || c.gestorEmail !== null, {
    message: "Para avisar por e-mail, informe o e-mail do gestor.",
    path: ["gestorEmail"],
  });

export type DadosDoCliente = z.infer<typeof esquemaCliente>;

/**
 * Como o cliente aparece nas listas.
 *
 * O nome fantasia vence a razão social: é como a equipe e o próprio cliente o
 * chamam. "SOBERANO GRILL IND. E COM. DE CHURRASQUEIRAS LTDA" não cabe numa
 * linha de tabela nem numa mensagem de WhatsApp.
 */
export function nomeCurto(cliente: { razaoSocial: string; nomeFantasia?: string | null }): string {
  return (cliente.nomeFantasia ?? "").trim() || cliente.razaoSocial;
}

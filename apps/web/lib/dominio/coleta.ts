/**
 * A coleta por link: até quando o link vale, e em que estado ele está.
 *
 * Puro, como o resto do domínio: sem I/O, sem relógio, sem React. "Hoje" entra
 * por parâmetro em ISO (`AAAA-MM-DD`), já no fuso de São Paulo.
 *
 * As mesmas funções servem à rota pública (abrir ou recusar), à tela da
 * analista (dizer até quando vale) e ao cron (não cobrar quem não tem link).
 * As três não podem discordar sobre se um link está aberto.
 *
 * A comparação é de TEXTO, entre datas ISO, e não de instantes. Decidir prazo
 * com `Date` significaria decidir em UTC, onde às 21h de São Paulo já é
 * amanhã: um link que vale até hoje recusaria o gestor que abre depois do
 * jantar. O mesmo motivo de `hoje.ts` existir.
 */

import { z } from "zod";

import type { DatasDoMes } from "./controle";
import { cpfValido, limparDocumento } from "./documento";
import { hojeSaoPaulo } from "./hoje";
import { dataBrParaIso, valorParaNumero } from "./mascaras";
import { digitosDoTelefone } from "./telefone";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* --------------------------------------------------------------------------
   Até quando o link vale
   -------------------------------------------------------------------------- */

/**
 * O piso: um link nunca nasce valendo menos do que isto.
 *
 * Decisão de 05/10: o link vale **até o corte**. Mas a analista manda o link
 * quando se lembra, e às vezes isso é depois do corte — numa competência que
 * reabriu, num cliente que entrou no meio do mês, no primeiro mês de uso. Sem
 * o piso o link nasceria morto, e beco sem saída é defeito: o gestor clicaria
 * no WhatsApp para ler "este link expirou".
 */
export const DIAS_MINIMOS = 3;

/**
 * Até que DIA o link abre, inclusive.
 *
 * O corte é a data em que a seguradora fecha a movimentação do mês: informar
 * depois dele não entra na fatura, então é ali que o link deixa de servir.
 *
 * Sem corte — a apólice que não tem movimentação (saúde PME, global,
 * transporte) — vale até o boleto, que é a próxima data que existe. Esse
 * cliente não deveria receber link nenhum; se receber, melhor um prazo
 * razoável do que um erro.
 */
export function valeAte(datas: DatasDoMes, hoje: string): string {
  const limite = datas.corte ?? datas.boleto;
  const piso = somarDias(hoje, DIAS_MINIMOS);
  return limite > piso ? limite : piso;
}

/** `2026-09-28` + 3 = `2026-10-01`. Em UTC, que não tem horário de verão. */
function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/* --------------------------------------------------------------------------
   O token
   -------------------------------------------------------------------------- */

/**
 * 32 bytes. O token é a única credencial da rota pública, e ela é aberta na
 * internet: quem adivinhar um token lê a relação de vidas de uma empresa.
 * Com 256 bits de aleatoriedade, adivinhar não é uma estratégia.
 */
export const BYTES_DO_TOKEN = 32;

/**
 * Os bytes em `base64url`, que entra numa URL sem escape.
 *
 * Recebe os bytes em vez de sorteá-los para poder ser testada: quem chama é
 * que traz o `randomBytes` do servidor. `Math.random` não serve aqui e nunca
 * vai servir — é previsível por construção.
 */
export function tokenDeColeta(bytes: Uint8Array): string {
  if (bytes.length < BYTES_DO_TOKEN) {
    throw new Error(`token de coleta precisa de ${BYTES_DO_TOKEN} bytes, recebeu ${bytes.length}`);
  }
  let bruto = "";
  for (const b of bytes) bruto += String.fromCharCode(b);
  return btoa(bruto).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/**
 * Parece um token nosso?
 *
 * Serve para a rota pública recusar lixo ANTES de ir ao banco — um `/coleta/`
 * com 4 KB de texto na URL não merece uma consulta.
 */
export function pareceToken(valor: string): boolean {
  return /^[A-Za-z0-9_-]{40,64}$/.test(valor);
}

/* --------------------------------------------------------------------------
   O estado do link
   -------------------------------------------------------------------------- */

/**
 * Os quatro estados, e cada um tem tela própria na rota pública.
 *
 * `404` seco não serve a nenhum deles: o gestor que recebeu o link e esbarra
 * no prazo precisa saber a quem ligar, e quem já enviou precisa poder
 * conferir o que mandou. Dizer "não existe" para os dois é mentir para um e
 * assustar o outro.
 */
export type EstadoDoLink =
  /** Abre o formulário. */
  | "aberto"
  /** Já enviou, e pode rever ou corrigir — o link continua dele. */
  | "enviado"
  /** Passou do corte. A tela diz com quem falar. */
  | "expirado"
  /** Token que não casa com mês nenhum, ou mês sem link gerado. */
  | "invalido";

/** O que a rota pública precisa saber do mês, e nada além. */
export type MesDaColeta = {
  /** Nulo quando a analista nunca gerou o link. */
  token: string | null;
  /** O dia, inclusive, até o qual abre. */
  valeAte: string | null;
  /** Quando o gestor enviou. Nulo = ainda não enviou. */
  recebidoEm: string | null;
};

/**
 * Enviado VENCE expirado, de propósito.
 *
 * Decisão de 05/10: o gestor pode mudar o que informou depois de enviar, e a
 * analista recebe um alerta. Fechar o link no corte para quem JÁ enviou
 * tiraria dele a única cópia do que mandou — e ele não tem conta para
 * consultar em outro lugar. Quem não enviou nada até o corte não tem o que
 * rever, e para esse o prazo vale.
 */
export function estadoDoLink(mes: MesDaColeta | null, hoje: string): EstadoDoLink {
  if (!mes || !mes.token || !mes.valeAte) return "invalido";
  if (mes.recebidoEm) return "enviado";
  return hoje <= mes.valeAte ? "aberto" : "expirado";
}

/** Dias que faltam para fechar. Negativo quando já fechou. */
export function diasParaFechar(valeAte: string, hoje: string): number {
  const ms = Date.parse(`${valeAte}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/* --------------------------------------------------------------------------
   As pessoas
   -------------------------------------------------------------------------- */

export type TipoDeMovimento = "entrada" | "saida";

export type QuemDigitou = "gestor" | "equipe";

export type Movimento = {
  tipo: TipoDeMovimento;
  nome: string;
  /** CPF, só dígitos. Nulo quando o gestor não tinha à mão. */
  documento: string | null;
  /**
   * Os dados de INCLUSÃO: só a entrada tem.
   *
   * A seguradora precisa da idade (prêmio e limite de idade), do cargo (o
   * capital pode ser por cargo) e do salário (capital em múltiplo salarial)
   * para incluir alguém. Para excluir, basta saber quem é. Na saída os três são
   * sempre nulos — e o banco tem um check que garante isso.
   */
  nascimento: string | null;
  cargo: string | null;
  salario: number | null;
  porQuem: QuemDigitou;
};

export const ROTULO_MOVIMENTO: Record<TipoDeMovimento, string> = {
  entrada: "Quem entrou",
  saida: "Quem saiu",
};

/* --------------------------------------------------------------------------
   O formulário, em zod
   -------------------------------------------------------------------------- */

/**
 * O MESMO esquema roda no navegador e na rota pública (regra 3).
 *
 * A rota não pode confiar em nada que chegue: ela é aberta na internet, e o
 * token prova que a pessoa recebeu o link, não que o corpo do POST veio da
 * nossa tela. Um esquema só, nos dois lados, é o que impede a validação do
 * navegador e a do servidor de discordarem — e discordar aqui significa ou
 * recusar quem está certo, ou gravar CPF inválido.
 */

const texto = (valor: unknown) => (typeof valor === "string" ? valor.trim() : "");

const opcional = (max: number) =>
  z.preprocess(texto, z.string().max(max, `Máximo de ${max} caracteres.`)).transform((v) => v || null);

/** Quem SAIU: nome e CPF. É tudo o que a seguradora pede para excluir. */
export const esquemaSaida = z.object({
  nome: z.preprocess(
    texto,
    z.string().min(3, "Informe o nome completo.").max(120, "Máximo de 120 caracteres."),
  ),

  /**
   * CPF opcional, de propósito.
   *
   * O gestor que não tem o CPF à mão informa o nome, e a analista completa pela
   * planilha. Exigir aqui faria ele inventar um número para o formulário deixar
   * passar — e aí o dado entra errado parecendo certo, que é pior que faltar.
   */
  documento: z.preprocess(
    (valor) => limparDocumento(texto(valor)),
    z.string().refine((d) => d === "" || cpfValido(d), { message: "CPF inválido." }),
  ).transform((v) => v || null),
});

/**
 * Quem ENTROU: nome, CPF, nascimento, cargo e salário (pedido de 06/10).
 *
 * Os três novos são opcionais pelo mesmo motivo do CPF: o gestor que não tem o
 * dado à mão informa o nome e a MX completa. Exigir faria ele inventar um
 * nascimento para o formulário passar — e o prêmio sairia calculado sobre uma
 * idade falsa, que ninguém confere depois porque "estava preenchido".
 */
export const esquemaEntrada = esquemaSaida.extend({
  /** Digitado como dd/mm/aaaa; sai em ISO. */
  nascimento: z.preprocess(
    texto,
    z
      .string()
      .refine((v) => v === "" || dataBrParaIso(v) !== null, { message: "Data inválida: use dd/mm/aaaa." })
      // `hojeSaoPaulo` é o único lugar do sistema que lê o relógio, e o
      // esquema roda nos dois lados — no navegador e na rota. Um nascimento no
      // futuro é sempre digitação errada.
      .refine((v) => v === "" || (dataBrParaIso(v) ?? "") <= hojeSaoPaulo(), {
        message: "A data de nascimento está no futuro.",
      })
      .refine((v) => v === "" || (dataBrParaIso(v) ?? "") > "1900-01-01", { message: "Confira o ano." }),
  ).transform((v) => (v ? dataBrParaIso(v) : null)),

  cargo: opcional(80),

  /** "R$ 3.500,00" ou "3500" — o que vier da máscara ou de uma colagem. */
  salario: z.preprocess(
    texto,
    z
      .string()
      .refine((v) => v === "" || valorParaNumero(v) !== null, { message: "Valor inválido." })
      .refine((v) => v === "" || (valorParaNumero(v) ?? 0) > 0, { message: "O salário precisa ser maior que zero." })
      .refine((v) => v === "" || (valorParaNumero(v) ?? 0) < 10_000_000, { message: "Confira o valor." }),
  ).transform((v) => (v ? valorParaNumero(v) : null)),
});

export const esquemaColeta = z
  .object({
    // Quem está informando. O nome é dele, não da empresa: a empresa vem do
    // cadastro e aparece travada na tela.
    nome: z.preprocess(texto, z.string().min(3, "Informe seu nome.").max(120)),

    celular: z.preprocess(
      (valor) => digitosDoTelefone(texto(valor)),
      z.string().refine((d) => d.length >= 10 && d.length <= 13, {
        message: "Celular incompleto: DDD e número.",
      }),
    ),

    /** Pode ficar em branco: campo que obriga sem precisar é beco sem saída. */
    setor: opcional(80),

    /** O atalho "Ninguém entrou nem saiu". */
    semMovimentacao: z.boolean().default(false),

    entradas: z.array(esquemaEntrada).max(500, "Muitas pessoas para um formulário: envie pela planilha."),
    saidas: z.array(esquemaSaida).max(500, "Muitas pessoas para um formulário: envie pela planilha."),

    /** A ficha do arquivo que o upload já criou. Nulo = não mandou planilha. */
    planilhaId: z.preprocess(
      (valor) => texto(valor),
      z.string().refine((v) => v === "" || UUID.test(v), { message: "Arquivo inválido." }),
    ).transform((v) => v || null),

    observacao: opcional(500),
  })
  /**
   * Alguma coisa tem de chegar: ou o atalho, ou uma pessoa, ou a planilha.
   *
   * As três contam, e não só as duas primeiras. O gestor que tem a planilha
   * pronta não vai redigitar quarenta nomes para o formulário aceitar, e
   * recusá-lo seria transformar "a planilha é opcional" em "a planilha não
   * serve". A conferência da Fase 5 cruza o que vier.
   */
  .refine((c) => c.semMovimentacao || c.entradas.length > 0 || c.saidas.length > 0 || c.planilhaId !== null, {
    message: 'Informe quem entrou ou saiu, envie a planilha, ou marque "Ninguém entrou nem saiu".',
    path: ["semMovimentacao"],
  })
  /**
   * O atalho é uma AFIRMAÇÃO, e não um atalho de digitação: ele diz à MX que o
   * mês não teve movimentação, e o mês segue direto para conferido. Marcá-lo com
   * gente na lista é uma contradição que alguém precisa resolver antes de virar
   * dado — e quem está na tela resolve melhor que a analista depois.
   */
  .refine((c) => !c.semMovimentacao || (c.entradas.length === 0 && c.saidas.length === 0), {
    message: 'Você marcou "ninguém entrou nem saiu", mas informou pessoas. Desmarque, ou apague a lista.',
    path: ["semMovimentacao"],
  });

export type DadosDaColeta = z.infer<typeof esquemaColeta>;

/**
 * As pessoas, prontas para o banco.
 *
 * Quem digitou entra aqui e não no formulário: o navegador do gestor não tem
 * como se declarar `equipe`, e aceitar esse campo do corpo do POST deixaria
 * qualquer um marcar a própria linha como vinda da MX — e a conferência da
 * Fase 5 ignoraria justamente o que ela precisa cruzar.
 */
export function movimentosDaColeta(dados: DadosDaColeta, porQuem: QuemDigitou): Movimento[] {
  return [
    ...dados.entradas.map((p) => ({
      tipo: "entrada" as const,
      nome: p.nome,
      documento: p.documento,
      nascimento: p.nascimento,
      cargo: p.cargo,
      salario: p.salario,
      porQuem,
    })),
    ...dados.saidas.map((p) => ({
      tipo: "saida" as const,
      nome: p.nome,
      documento: p.documento,
      nascimento: null,
      cargo: null,
      salario: null,
      porQuem,
    })),
  ];
}

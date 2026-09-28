import { formatarData, renderizarTemplate, variaveisDesconhecidas, CORRETORA } from "./email";
import { formatarMoeda } from "./mascaras";
import { digitosDoTelefone } from "./telefone";
import { nomeDoMes, type ModeloDeMensagem } from "./controle";

/**
 * As mensagens do mês: o texto que o cliente recebe em cada data.
 *
 * Os modelos moram no banco (`message_templates`) e o administrador os edita
 * em Configurações. Aqui ficam as três coisas que o modelo não sabe fazer
 * sozinho: a lista FECHADA de variáveis, os valores de cada uma e o link do
 * WhatsApp.
 *
 * Puro, sem I/O: a mesma função monta a prévia na tela e o e-mail no cron.
 */

export const ROTULO_MODELO: Record<ModeloDeMensagem, string> = {
  informar: "Informar até",
  corte: "Corte",
  boleto: "Boleto",
  vencimento: "Vencimento",
  correcao: "Correção",
};

/** Quando cada mensagem sai — o texto da coluna "Quando sai" em Configurações. */
export const QUANDO_SAI: Record<ModeloDeMensagem, string> = {
  informar: "no dia de informar",
  corte: "no dia do corte",
  boleto: "ao anexar o boleto",
  vencimento: "três dias antes do vencimento",
  correcao: "quando a analista pede correção",
};

/**
 * Lista fechada: é ela que avisa o administrador de que `{{cor_do_boleto}}`
 * nunca vai virar nada. Sem a lista, o erro só apareceria no celular do
 * cliente, como uma lacuna no meio da frase.
 */
export const VARIAVEIS_DA_MENSAGEM = [
  "cliente",
  "gestor",
  "mes",
  "data",
  "data_corte",
  "data_boleto",
  "data_vencimento",
  "valor",
  "link",
  "seguradora",
  "analista",
  "motivo",
  "corretora",
] as const;

export type VariavelDaMensagem = (typeof VARIAVEIS_DA_MENSAGEM)[number];

export type ContextoDaMensagem = {
  /** Nome fantasia, que é como o cliente se reconhece. */
  cliente: string;
  gestor: string | null;
  /** `2026-09`. */
  competencia: string;
  /** A data do passo a que a mensagem se refere, em ISO. */
  data: string | null;
  dataCorte: string | null;
  dataBoleto: string | null;
  dataVencimento: string | null;
  valorDoBoleto: number | null;
  /** O endereço do portal, já absoluto. */
  link: string;
  seguradora: string | null;
  analista: string | null;
  /** Só na correção: o que faltou na planilha. */
  motivo?: string | null;
};

/** O primeiro nome, para a mensagem cumprimentar sem soar de cartório. */
function primeiroNome(nome: string | null): string {
  return (nome ?? "").trim().split(/\s+/)[0] ?? "";
}

function dataOuVazio(iso: string | null): string {
  return iso ? formatarData(iso) : "";
}

export function variaveisDaMensagem(contexto: ContextoDaMensagem): Record<VariavelDaMensagem, string> {
  return {
    cliente: contexto.cliente,
    gestor: primeiroNome(contexto.gestor),
    mes: nomeDoMes(contexto.competencia),
    data: dataOuVazio(contexto.data),
    data_corte: dataOuVazio(contexto.dataCorte),
    data_boleto: dataOuVazio(contexto.dataBoleto),
    data_vencimento: dataOuVazio(contexto.dataVencimento),
    valor: contexto.valorDoBoleto === null ? "" : formatarMoeda(contexto.valorDoBoleto),
    link: contexto.link,
    seguradora: contexto.seguradora ?? "",
    analista: primeiroNome(contexto.analista),
    motivo: contexto.motivo ?? "",
    corretora: CORRETORA,
  };
}

/**
 * O texto pronto.
 *
 * Variável sem valor deixa um buraco — "vence em ." — e dois espaços seguidos.
 * O texto é aparado aqui para o buraco não virar pontuação solta: espaço antes
 * de vírgula e de ponto some, e espaço duplo vira um.
 */
export function montarMensagem(modelo: string, contexto: ContextoDaMensagem): string {
  return renderizarTemplate(modelo, variaveisDaMensagem(contexto))
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.;:!?])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** As variáveis do modelo que não existem — para recusar ao salvar. */
export function variaveisInvalidas(modelo: string): string[] {
  return variaveisDesconhecidas(modelo, VARIAVEIS_DA_MENSAGEM);
}

/* --------------------------------------------------------------------------
   WhatsApp
   -------------------------------------------------------------------------- */

/** O WhatsApp corta o texto do link bem antes disto; acima, o link nem abre. */
export const LIMITE_DO_WHATSAPP = 1800;

/**
 * O link que abre a conversa com o texto pronto.
 *
 * Número de até 11 dígitos é brasileiro sem o código do país: entra o 55.
 * Devolve `null` para telefone que não dá para discar — quem chama mostra
 * "sem celular cadastrado" em vez de abrir uma conversa com ninguém.
 */
export function linkWhatsapp(telefone: string | null | undefined, texto: string): string | null {
  const digitos = digitosDoTelefone(telefone ?? "");
  if (digitos.length < 10 || digitos.length > 13) return null;

  const numero = digitos.length <= 11 ? `55${digitos}` : digitos;
  const corpo = texto.length > LIMITE_DO_WHATSAPP ? `${texto.slice(0, LIMITE_DO_WHATSAPP - 1)}…` : texto;
  return `https://wa.me/${numero}?text=${encodeURIComponent(corpo)}`;
}

/* --------------------------------------------------------------------------
   Canal
   -------------------------------------------------------------------------- */

export type Canal = "whatsapp" | "email" | "ambos";

export const ROTULO_CANAL: Record<Canal, string> = {
  whatsapp: "WhatsApp",
  email: "E-mail",
  ambos: "WhatsApp e e-mail",
};

/** Por onde a mensagem sai, dado o canal do cliente e o que ele tem cadastrado. */
export function canaisPossiveis(
  canal: Canal,
  contato: { celular: string | null; email: string | null },
): { whatsapp: boolean; email: boolean } {
  const temCelular = linkWhatsapp(contato.celular, "") !== null;
  const temEmail = Boolean(contato.email && contato.email.includes("@"));
  return {
    whatsapp: temCelular && (canal === "whatsapp" || canal === "ambos"),
    email: temEmail && (canal === "email" || canal === "ambos"),
  };
}

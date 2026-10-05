import "server-only";

import { randomBytes } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { BYTES_DO_TOKEN, tokenDeColeta, valeAte } from "../dominio/coleta";
import { hojeSaoPaulo } from "../dominio/hoje";
import type { Falha, ResultadoEscrita } from "../clientes/servico";
import { clienteServidor } from "../supabase/servidor";

/**
 * O link de coleta: gerar, e dizer até quando vale.
 *
 * O token é sorteado AQUI, no servidor, e nunca no navegador: ele é a única
 * credencial da rota pública, e credencial sorteada no cliente é credencial que
 * o cliente escolhe.
 *
 * A decisão de PRAZO não mora aqui — mora em `lib/dominio/coleta.ts`, que é
 * puro e testado. Este arquivo faz I/O e nada mais.
 */

function falhaGenerica(): Falha {
  return { status: 503, codigo: "banco_indisponivel", mensagem: "Não foi possível salvar agora. Tente de novo." };
}

export type Gestor = {
  nome: string;
  celular: string;
  /** Pode ficar em branco: campo que obriga sem precisar é beco sem saída. */
  setor: string | null;
};

export type LinkGerado = {
  token: string;
  /** O dia, inclusive, até o qual o link abre. */
  valeAte: string;
};

/**
 * Gera (ou REGERA) o link do mês e guarda quem vai recebê-lo.
 *
 * Regerar troca o token de propósito. Quando o gestor muda — ou quando o
 * celular estava errado e o link foi para o número de alguém de fora —, o link
 * antigo tem de morrer. Manter os dois abertos deixaria a porta velha
 * destrancada sem ninguém saber.
 *
 * O gestor fica NO MÊS, e não no cadastro do cliente: quem informa pode mudar
 * de um mês para o outro, e sobrescrever o cadastro apagaria o contato que a MX
 * usa para o resto do ano.
 */
export async function gerarLinkDeColeta(
  controleId: string,
  gestor: Gestor,
  autor: string,
  hoje: string = hojeSaoPaulo(),
): Promise<ResultadoEscrita<LinkGerado>> {
  try {
    const supabase = await clienteServidor();

    const { data: mes, error: erroLeitura } = await supabase
      .from("monthly_controls")
      .select("id, cutoff_date, invoice_date, due_date, inform_date, collection_token")
      .eq("id", controleId)
      .maybeSingle();

    if (erroLeitura) return { ok: false, falha: falhaGenerica() };
    if (!mes) {
      return {
        ok: false,
        falha: { status: 404, codigo: "nao_encontrado", mensagem: "Esta movimentação não existe." },
      };
    }

    const linha = mes as {
      inform_date: string | null;
      cutoff_date: string | null;
      invoice_date: string;
      due_date: string;
      collection_token: string | null;
    };

    const fecha = valeAte(
      {
        informar: linha.inform_date,
        corte: linha.cutoff_date,
        boleto: linha.invoice_date,
        vencimento: linha.due_date,
      },
      hoje,
    );

    const token = tokenDeColeta(randomBytes(BYTES_DO_TOKEN));

    const { error: erroUpdate } = await supabase
      .from("monthly_controls")
      .update({
        collection_token: token,
        // Fim do dia, no fuso de São Paulo. O domínio decide em DIA e compara
        // texto; o banco guarda o instante para o registro — e um link que
        // vale "até o dia 10" tem de abrir às 23h do dia 10.
        collection_expires_at: `${fecha}T23:59:59-03:00`,
        // Zera a abertura: token novo, contagem nova. Senão a tela diria que o
        // gestor já abriu um link que ele nem recebeu.
        collection_opened_at: null,
        manager_name: gestor.nome,
        manager_phone: gestor.celular,
        manager_sector: gestor.setor,
      })
      .eq("id", controleId);

    if (erroUpdate) return { ok: false, falha: falhaGenerica() };

    const { error: erroEvento } = await supabase.from("control_events").insert({
      control_id: controleId,
      type: "link_sent",
      origin: "staff",
      actor_profile_id: autor,
      // O token NÃO entra na nota. A linha do tempo é lida na tela e sai no
      // log; um token ali é a credencial impressa ao lado da porta.
      note: linha.collection_token
        ? `Link refeito. Vale até ${fecha}. O link anterior parou de abrir.`
        : `Link gerado. Vale até ${fecha}.`,
    });

    // Mudança sem registro é pior que mudança que não aconteceu: desfaz.
    if (erroEvento) {
      await supabase
        .from("monthly_controls")
        .update({ collection_token: null, collection_expires_at: null })
        .eq("id", controleId);
      return {
        ok: false,
        falha: {
          status: 503,
          codigo: "evento_falhou",
          mensagem: "O link foi desfeito porque não consegui registrá-lo no histórico.",
        },
      };
    }

    return { ok: true, dados: { token, valeAte: fecha } };
  } catch {
    return { ok: false, falha: falhaGenerica() };
  }
}

/**
 * O token do mês, numa consulta de uma linha.
 *
 * Não vem da `v_control_board` de propósito: aquela view desenha 177 linhas no
 * Controle, e pôr o token em cada uma faria a credencial de acesso às vidas de
 * todos os clientes viajar até o navegador a cada abertura da tela. Quem precisa
 * dele é esta tela, para um mês.
 *
 * Lê com o cliente da SESSÃO: a RLS confere que quem pede é da equipe. É o
 * contrário da rota pública, onde não há sessão e o token é a autoridade.
 */
export async function lerTokenDoMes(controleId: string): Promise<string | null> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("monthly_controls")
      .select("collection_token")
      .eq("id", controleId)
      .maybeSingle();

    if (error || !data) return null;
    return (data as { collection_token: string | null }).collection_token;
  } catch {
    return null;
  }
}

/**
 * O link do mês, gerando um se ainda não houver.
 *
 * Serve às MENSAGENS: o cron manda o aviso de "informar até" às 7h, sem sessão
 * nenhuma, e o texto precisa carregar um endereço que abra. Gerar na hora do
 * envio é o que evita a mensagem sair com `{{link}}` vazio — um aviso que pede
 * movimentação sem dizer por onde é pior que nenhum aviso.
 *
 * NÃO refaz o que já existe. Refazer mataria o link que o gestor já tem aberto:
 * o aviso de corte sai depois do de informar, e o segundo envio invalidaria o
 * primeiro no meio do preenchimento.
 *
 * Devolve `null` quando não dá para gerar. Quem chama põe `{{link}}` vazio e a
 * mensagem sai sem ele — melhor um texto incompleto que um texto com um
 * endereço quebrado.
 */
export async function garantirLinkDeColeta(
  controleId: string,
  gestor: Gestor,
  cliente: SupabaseClient,
  hoje: string = hojeSaoPaulo(),
): Promise<string | null> {
  try {
    const { data, error } = await cliente
      .from("monthly_controls")
      .select("collection_token, collection_expires_at, inform_date, cutoff_date, invoice_date, due_date")
      .eq("id", controleId)
      .maybeSingle();

    if (error || !data) return null;

    const linha = data as {
      collection_token: string | null;
      collection_expires_at: string | null;
      inform_date: string | null;
      cutoff_date: string | null;
      invoice_date: string;
      due_date: string;
    };

    if (linha.collection_token) return linha.collection_token;

    const fecha = valeAte(
      {
        informar: linha.inform_date,
        corte: linha.cutoff_date,
        boleto: linha.invoice_date,
        vencimento: linha.due_date,
      },
      hoje,
    );

    const token = tokenDeColeta(randomBytes(BYTES_DO_TOKEN));

    const { error: erroUpdate } = await cliente
      .from("monthly_controls")
      .update({
        collection_token: token,
        collection_expires_at: `${fecha}T23:59:59-03:00`,
        manager_name: gestor.nome,
        manager_phone: gestor.celular,
        manager_sector: gestor.setor,
      })
      .eq("id", controleId);

    if (erroUpdate) return null;

    // Origem `system`: ninguém clicou. A linha do tempo precisa dizer isso —
    // "a MX mandou o link" e "o job das 7h mandou o link" levam a conversas
    // diferentes quando o gestor liga dizendo que não recebeu nada.
    await cliente.from("control_events").insert({
      control_id: controleId,
      type: "link_sent",
      origin: "system",
      note: `Link gerado junto com o aviso automático. Vale até ${fecha}.`,
    });

    return token;
  } catch {
    return null;
  }
}

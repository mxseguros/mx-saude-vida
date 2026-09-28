import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { clienteAdministrador } from "@/lib/supabase/administrador";
import { registrarLog } from "@/lib/log";
import { rodarODia } from "@/lib/controles/cron";
import { hojeSaoPaulo } from "@/lib/dominio/hoje";

/**
 * O job das 07h (BRT) — o que faz o Controle andar sozinho.
 *
 * Toda manhã, em ordem: abre a competência do mês para quem ainda não a tem,
 * avança os passos que o calendário move (corte, vencimento) e envia as
 * mensagens cujo dia chegou. O que é WhatsApp fica `pendente`, para a analista
 * abrir com um clique — o sistema não manda WhatsApp sozinho.
 *
 * TRÊS COISAS PRECISAM ESTAR CERTAS AQUI, porque uma rota de cron é uma porta
 * aberta na internet com um segredo por fechadura:
 *
 * 1. Sem `CRON_SECRET` configurado, a rota responde 503 e NÃO EXECUTA. Nunca
 *    "libera por não haver segredo" — a variável esquecida num deploy não pode
 *    ser a que abre o job para qualquer um.
 * 2. A comparação do segredo é de tempo constante. Comparar com `===` vaza o
 *    prefixo correto pela diferença de tempo de resposta.
 * 3. A resposta não devolve cliente nenhum, só contagens. O job roda com a
 *    chave secreta, que ignora a RLS: tudo que ele imprimisse no corpo
 *    vazaria para quem descobrisse o segredo.
 *
 * A idempotência do DIA é a chave primária de `cron_runs`, que é a data. A
 * idempotência de cada MENSAGEM é `(control_id, kind)`: mesmo que alguém
 * chame a rota à mão três vezes, o cliente recebe o aviso do corte uma vez.
 */

// Node, e não edge: o cliente administrador precisa.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function segredoConfere(cabecalho: string | null, esperado: string): boolean {
  if (!cabecalho) return false;

  const recebido = cabecalho.startsWith("Bearer ") ? cabecalho.slice(7) : cabecalho;

  // `timingSafeEqual` lança se os tamanhos diferem, e o próprio tamanho já é
  // informação. Conferir o tamanho antes evita os dois problemas.
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

export async function GET(requisicao: NextRequest) {
  const esperado = process.env.CRON_SECRET;

  if (!esperado) {
    return NextResponse.json({ error: { message: "O job mensal não está configurado." } }, { status: 503 });
  }

  if (!segredoConfere(requisicao.headers.get("authorization"), esperado)) {
    return NextResponse.json({ error: { message: "Não autorizado." } }, { status: 401 });
  }

  const hoje = hojeSaoPaulo();
  const supabase = clienteAdministrador();

  // A marca do dia vem ANTES do trabalho, e sem `select` antes do `insert`:
  // duas execuções simultâneas (o cron da Vercel e alguém chamando à mão)
  // colidem na chave primária, e a segunda desiste em vez de enviar tudo de
  // novo.
  const { error: erroMarca } = await supabase.from("cron_runs").insert({ run_date: hoje });

  if (erroMarca) {
    // 23505 = unique_violation: já rodou hoje. Não é erro — é o job fazendo
    // exatamente o que devia.
    if (erroMarca.code === "23505") {
      return NextResponse.json({ data: { dia: hoje, jaRodou: true } });
    }
    registrarLog("erro", "cron.mensal.marca", { codigo: erroMarca.code });
    return NextResponse.json({ error: { message: "Não foi possível registrar a execução." } }, { status: 503 });
  }

  const resumo = await rodarODia(hoje, supabase);

  // O resumo fica na linha do dia: é onde se responde "o cliente foi avisado?"
  // três semanas depois, sem depender do log da Vercel, que expira.
  await supabase.from("cron_runs").update({ summary: resumo }).eq("run_date", hoje);

  registrarLog("info", "cron.mensal", resumo);

  return NextResponse.json({ data: { dia: hoje, ...resumo } });
}

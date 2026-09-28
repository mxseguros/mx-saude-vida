import { NextResponse } from "next/server";

import { enviarEmail } from "@/lib/email/enviar";
import {
  mensagemDeAutenticacao,
  tipoConhecido,
  urlDeVerificacao,
} from "@/lib/dominio/email-auth";
import { verificarAssinatura } from "@/lib/dominio/webhook";

/**
 * POST /api/auth/email — o "Send Email hook" do Supabase.
 *
 * Quando configurado (Authentication › Hooks › Send Email), o Supabase para
 * de mandar magic link, convite e recuperação de senha pelo SMTP dele — que
 * permite ~2 envios por hora e travou a equipe no MX Leads — e chama esta
 * rota, que envia pela caixa da MX, pelo mesmo caminho do resto do sistema.
 *
 * É a SEGUNDA rota que grava sem sessão (a primeira é o cadastro público de
 * parceiro), e como ela mora fora de `/api/v1`. Quem autoriza é a assinatura
 * do pedido: sem `SUPABASE_AUTH_HOOK_SECRET`, a rota devolve 503 e não
 * envia — a variável esquecida não pode ser a que transforma isto num
 * disparador de e-mail aberto na internet. Tempo constante e tolerância de
 * cinco minutos em `verificarAssinatura`, com teste.
 *
 * Resposta: `{}` com 200 quando enviou. Falha de envio devolve 500 com o
 * motivo — o Supabase mostra o erro a quem pediu o link, que é melhor do que
 * "verifique seu e-mail" para um e-mail que não saiu. Nunca o corpo do
 * e-mail, nunca o token.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Carga = {
  user?: { email?: string };
  email_data?: {
    token?: string;
    token_hash?: string;
    redirect_to?: string;
    email_action_type?: string;
    site_url?: string;
  };
};

export async function POST(request: Request) {
  const segredo = process.env.SUPABASE_AUTH_HOOK_SECRET;
  if (!segredo) {
    return NextResponse.json({ error: { message: "Gancho não configurado." } }, { status: 503 });
  }

  // O corpo CRU: a assinatura cobre os bytes exatos, não o JSON reserializado.
  const corpo = await request.text();

  const verificacao = verificarAssinatura(
    {
      id: request.headers.get("webhook-id"),
      timestamp: request.headers.get("webhook-timestamp"),
      assinatura: request.headers.get("webhook-signature"),
    },
    corpo,
    segredo,
  );
  if (!verificacao.ok) {
    return NextResponse.json({ error: { message: "Assinatura inválida." } }, { status: 401 });
  }

  let carga: Carga;
  try {
    carga = JSON.parse(corpo) as Carga;
  } catch {
    return NextResponse.json({ error: { message: "Corpo inválido." } }, { status: 400 });
  }

  const para = carga.user?.email?.trim();
  const dados = carga.email_data ?? {};
  const tipo = dados.email_action_type;

  if (!para || !tipoConhecido(tipo) || !dados.token_hash) {
    return NextResponse.json({ error: { message: "Pedido incompleto." } }, { status: 400 });
  }

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const url = urlDeVerificacao(base, dados.token_hash, tipo, dados.redirect_to ?? dados.site_url ?? "");
  const mensagem = mensagemDeAutenticacao(tipo, { url, codigo: dados.token });

  const envio = await enviarEmail({ para: [para], ...mensagem });

  if (!envio.ok) {
    return NextResponse.json(
      { error: { http_code: 500, message: `E-mail não enviado: ${envio.mensagem}` } },
      { status: 500 },
    );
  }

  return NextResponse.json({});
}

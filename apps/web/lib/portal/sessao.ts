import "server-only";

import { NextResponse } from "next/server";

import { situacaoDoCliente, type ClienteLogado } from "../supabase/servidor";
import { erroJson } from "../api";

/**
 * A guarda das rotas do portal.
 *
 * Espelha `exigirPerfil` de `lib/api.ts` e troca o público: aqui quem passa é
 * `client_users`. Mora em `lib/portal/` e não em `lib/api.ts` para que fique
 * impossível confundir as duas — uma rota de `/api/v1` que chamasse esta função
 * por engano deixaria um gestor de cliente operar o Controle.
 *
 * A RLS já barraria a consulta, mas devolveria zero linhas, e a tela leria isso
 * como "não existe". Barrar aqui dá 401 e a mensagem certa.
 */
export async function exigirCliente(): Promise<
  { ok: true; cliente: ClienteLogado } | { ok: false; resposta: NextResponse }
> {
  const situacao = await situacaoDoCliente();

  if (situacao.estado === "ok") return { ok: true, cliente: situacao.cliente };

  if (situacao.estado === "sem_sessao") {
    return { ok: false, resposta: erroJson(401, "sem_sessao", "Sua sessão expirou. Entre de novo.") };
  }

  if (situacao.estado === "indisponivel") {
    return { ok: false, resposta: erroJson(503, "sem_banco", "Não foi possível falar com o servidor.") };
  }

  return {
    ok: false,
    resposta: erroJson(403, "sem_acesso", "Sua conta não tem acesso ao portal. Fale com a MX."),
  };
}

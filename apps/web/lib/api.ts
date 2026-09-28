import "server-only";

import { NextResponse } from "next/server";

import { registrarLog } from "./log";
import { perfilAtual } from "./supabase/servidor";
import type { Pessoa } from "./dominio/tipos";

/**
 * Pecas comuns das rotas.
 *
 * Erro sai sempre como {error:{code,message,field?}}, com a mensagem em
 * portugues pronta para exibir — a interface mostra o que vier, sem traduzir.
 * Uma mensagem so, escrita uma vez, e o mesmo texto em toda tela.
 */

export type Perfil = Pessoa;

export function erroJson(
  status: number,
  code: string,
  message: string,
  field?: string,
) {
  // Toda resposta 5xx vira uma linha de log estruturado, aqui, num lugar
  // só: é como o painel da Vercel passa a responder "quantos erros hoje, e
  // de qual código". Só o código e o status — a mensagem pode carregar nome
  // de cliente, e o log não é lugar para isso.
  if (status >= 500) registrarLog("erro", "api.erro", { status, codigo: code });

  return NextResponse.json(
    { error: { code, message, ...(field ? { field } : {}) } },
    { status },
  );
}

/**
 * Exige sessao de perfil ATIVO.
 *
 * A RLS ja barraria a consulta, mas devolveria zero linhas — que a interface
 * leria como "cadastro nao existe". Barrar aqui da 401 e a mensagem certa.
 * Defesa em profundidade: as duas camadas fazem a mesma pergunta.
 */
export async function exigirPerfil(): Promise<
  { ok: true; perfil: Perfil } | { ok: false; resposta: NextResponse }
> {
  const perfil = await perfilAtual();
  if (!perfil) {
    return {
      ok: false,
      resposta: erroJson(401, "sem_sessao", "Sua sessão expirou. Entre de novo."),
    };
  }
  return { ok: true, perfil };
}

/**
 * Exige um perfil que ESCREVE: analista ou admin.
 *
 * O perfil `leitura` consulta e baixa, mas nao altera cadastro, nao confere
 * planilha e nao envia mensagem. A RLS faz a mesma pergunta no banco.
 */
export async function exigirEscrita(): Promise<
  { ok: true; perfil: Perfil } | { ok: false; resposta: NextResponse }
> {
  const sessao = await exigirPerfil();
  if (!sessao.ok) return sessao;

  if (sessao.perfil.papel === "leitura") {
    return {
      ok: false,
      resposta: erroJson(
        403,
        "sem_permissao",
        "Seu perfil é de leitura: peça a um analista ou ao administrador.",
      ),
    };
  }
  return sessao;
}

/**
 * Configuracao (usuarios, mensagens, prompts) e do admin.
 */
export async function exigirAdmin(): Promise<
  { ok: true; perfil: Perfil } | { ok: false; resposta: NextResponse }
> {
  const sessao = await exigirPerfil();
  if (!sessao.ok) return sessao;

  if (sessao.perfil.papel !== "admin") {
    return {
      ok: false,
      resposta: erroJson(
        403,
        "sem_permissao",
        "Só o administrador pode alterar a configuração do sistema.",
      ),
    };
  }
  return sessao;
}

/** Le o corpo JSON sem deixar entrada malformada virar 500. */
export async function lerCorpo(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

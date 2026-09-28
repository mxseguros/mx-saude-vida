"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { clienteServidor } from "@/lib/supabase/servidor";
import { clienteAdministrador } from "@/lib/supabase/administrador";
import { MENSAGEM_BLOQUEADO, respostaDaSenhaErrada, type FalhaRegistrada } from "@/lib/dominio/bloqueio";
import { urlBase } from "@/lib/ambiente";
import { caminhoSeguro } from "@/lib/dominio/destino";

/**
 * Entrada da equipe da MX.
 *
 * Dois caminhos, e a existência dos dois é deliberada:
 *
 * SENHA       não depende de nada externo. É o caminho do dia a dia, e o
 *             único que funciona enquanto o SMTP do Supabase estiver no
 *             limite de envios.
 *
 * MAGIC LINK  não exige lembrar de senha, e é o caminho de recuperação de
 *             quem esqueceu a dela. Depende de e-mail sair.
 *
 * O mesmo schema zod valida aqui e no cliente: o cliente é conveniência, o
 * servidor é a autoridade.
 */

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Informe seu e-mail.")
  .email("E-mail incompleto — ex.: nome@mxseguros.com.br");

const esquemaSenha = z.object({
  email,
  senha: z.string().min(1, "Informe sua senha."),
});

const esquemaLink = z.object({ email });

export type ResultadoEntrada =
  | { ok: true; modo: "link"; email: string }
  | { ok: false; erro: string; campo?: "email" | "senha" };

/** Mensagem única para credencial errada: dizer qual metade falhou entrega
 *  quem trabalha na MX a quem estiver testando endereços. */
const CREDENCIAL_INVALIDA = "E-mail ou senha incorretos.";

export async function entrarComSenha(
  _anterior: ResultadoEntrada | null,
  dados: FormData,
): Promise<ResultadoEntrada> {
  const analise = esquemaSenha.safeParse({
    email: dados.get("email"),
    senha: dados.get("senha"),
  });

  if (!analise.success) {
    const problema = analise.error.issues[0];
    return {
      ok: false,
      erro: problema?.message ?? "Confira os dados informados.",
      campo: problema?.path[0] as "email" | "senha" | undefined,
    };
  }

  // Bloqueio na terceira senha errada (17/09). Contar é proteção: se a chave
  // de administração faltar ou o banco recusar, o login segue como sempre —
  // nada aqui pode ser o motivo de ninguém entrar.
  let admin: ReturnType<typeof clienteAdministrador> | null = null;
  try {
    admin = clienteAdministrador();
  } catch {
    admin = null;
  }

  try {
    // Bloqueado não tenta a senha: nem a certa entra, até o admin redefinir.
    if (admin) {
      const { data: bloqueado } = await admin.rpc("login_bloqueado", { p_email: analise.data.email });
      if (bloqueado === true) return { ok: false, erro: MENSAGEM_BLOQUEADO, campo: "senha" };
    }

    const supabase = await clienteServidor();
    // Fronteira de idioma (decisão D6): o app fala português, o SDK do
    // Supabase espera `password`.
    const { data: entrada, error } = await supabase.auth.signInWithPassword({
      email: analise.data.email,
      password: analise.data.senha,
    });

    if (error) {
      // "Email not confirmed" e "Invalid login credentials" viram a mesma
      // resposta de propósito. Só credencial errada conta para o bloqueio:
      // Auth fora do ar não pode trancar ninguém.
      if (!admin || !/invalid login credentials/i.test(error.message)) {
        return { ok: false, erro: CREDENCIAL_INVALIDA, campo: "senha" };
      }
      const { data: falha } = await admin.rpc("registrar_falha_de_login", { p_email: analise.data.email });
      const resposta = respostaDaSenhaErrada((falha ?? null) as FalhaRegistrada);
      if (resposta.bloqueou) {
        // O banco já bloqueou e derrubou as sessões. O banimento no Auth é o
        // que recusa quem tentar a senha direto no Supabase, fora deste
        // formulário; redefinir a senha em Equipe tira o banimento.
        const id = (falha as FalhaRegistrada)?.user_id;
        if (id) await admin.auth.admin.updateUserById(id, { ban_duration: "876000h" }).catch(() => null);
      }
      return { ok: false, erro: resposta.mensagem, campo: "senha" };
    }

    // Acertou: a contagem volta a zero.
    if (admin && entrada.user) {
      await admin.rpc("zerar_falhas_de_login", { p_user: entrada.user.id });
    }
  } catch {
    return { ok: false, erro: "Não foi possível entrar agora. Tente de novo." };
  }

  // Sem redirect() aqui: o middleware manda para /controle assim que a sessão
  // existe, e quem chamou recarrega. Redirecionar de dentro da action tornaria
  // o teste do fluxo mais difícil sem ganhar nada.
  return { ok: true, modo: "link", email: analise.data.email };
}

export async function enviarMagicLink(
  _anterior: ResultadoEntrada | null,
  dados: FormData,
): Promise<ResultadoEntrada> {
  const analise = esquemaLink.safeParse({ email: dados.get("email") });

  if (!analise.success) {
    return {
      ok: false,
      erro: analise.error.issues[0]?.message ?? "Verifique o e-mail informado.",
      campo: "email",
    };
  }

  // Limpo antes de entrar no e-mail. O callback valida de novo — as duas
  // camadas fazem a mesma pergunta —, mas um link enviado ja limpo nao vira
  // print de "o sistema me mandou um link para outro site".
  const destino = caminhoSeguro(String(dados.get("destino") ?? ""));

  try {
    const supabase = await clienteServidor();
    const { error } = await supabase.auth.signInWithOtp({
      email: analise.data.email,
      options: {
        // Quem não foi cadastrado pelo gestor não cria conta sozinho.
        shouldCreateUser: false,
        emailRedirectTo: `${urlBase()}/auth/confirmar?destino=${encodeURIComponent(destino)}`,
      },
    });

    if (error) {
      // O limite do SMTP embutido do Supabase é baixo e estourar é comum.
      // Dizer isso ajuda mais do que uma mensagem genérica.
      const limite = /rate|limit|too many/i.test(error.message);
      return {
        ok: false,
        erro: limite
          ? "Limite de e-mails atingido. Use a senha para entrar, ou tente daqui a pouco."
          : "Não foi possível enviar o link agora. Tente de novo em alguns minutos.",
      };
    }

    return { ok: true, modo: "link", email: analise.data.email };
  } catch {
    return { ok: false, erro: "Não foi possível enviar o link agora." };
  }
}

/**
 * Sair.
 *
 * Faltava: ate aqui nao havia como encerrar a sessao em lugar nenhum do
 * aplicativo. Numa corretora a maquina e compartilhada e a tela mostra CPF,
 * endereco e telefone de segurado — a sessao aberta da pessoa que saiu do
 * turno e a da pessoa que entrou.
 *
 * `signOut` revoga do lado do Supabase e limpa o cookie; o redirect leva para
 * /entrar. `redirect` lanca por dentro, entao vem depois do try — dentro dele,
 * o catch engoliria o desvio e a pessoa continuaria na tela achando que saiu.
 */
export async function sair(): Promise<void> {
  try {
    const supabase = await clienteServidor();
    await supabase.auth.signOut();
  } catch {
    // Sessao ja invalida ou banco fora do ar: o cookie sai do mesmo jeito no
    // redirect, e insistir aqui deixaria a pessoa presa numa tela logada.
  }

  redirect("/entrar");
}

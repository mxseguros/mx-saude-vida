import "server-only";

import { clienteServidor } from "../supabase/servidor";
import { clienteAdministrador } from "../supabase/administrador";
import { problemaDaSenha } from "../dominio/senha";
import type { Falha, ResultadoEscrita } from "./servico";
import type { Resultado } from "./consulta";

/**
 * O acesso do gestor do cliente ao portal.
 *
 * Um `client_user` é uma conta do Auth como qualquer outra; o que a torna
 * cliente é a linha em `client_users` apontando para um `client_id`. Ela NÃO
 * tem linha em `profiles` — é isso que faz a raiz mandá-la para `/portal` e as
 * molduras recusarem as telas da equipe.
 *
 * A senha é definida pelo ADMINISTRADOR e entregue por ele, como no acesso da
 * equipe. O convite por e-mail dependeria do gancho `Send Email` do Supabase,
 * que ainda não está ligado — e um convite que falha em silêncio é pior que
 * nenhum convite. Quando o gancho existir, "Reenviar senha" passa a poder
 * mandar o link em vez de mostrar a senha na tela.
 */

function falha(status: number, codigo: string, mensagem: string, campo?: string): { ok: false; falha: Falha } {
  return { ok: false, falha: { status, codigo, mensagem, campo } };
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type AcessoDoPortal = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  ativo: boolean;
  criadoEm: string;
};

/**
 * Quem tem acesso ao portal deste cliente.
 *
 * O e-mail vem do Auth, não de `client_users`: o endereço do login mora em
 * `auth.users`, e copiá-lo criaria duas verdades que divergem na primeira
 * troca. Falhar na busca do e-mail não derruba a lista — ele fica nulo e o
 * resto da linha aparece.
 */
export async function listarAcessos(clienteId: string): Promise<Resultado<AcessoDoPortal[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("client_users")
      .select("id, full_name, phone, active, created_at")
      .eq("client_id", clienteId)
      .order("active", { ascending: false })
      .order("full_name");

    if (error) return { dados: [], erro: "Não foi possível carregar os acessos ao portal." };

    const linhas = (data ?? []) as {
      id: string;
      full_name: string;
      phone: string | null;
      active: boolean;
      created_at: string;
    }[];

    if (!linhas.length) return { dados: [], erro: null };

    const emails = new Map<string, string>();
    try {
      const admin = clienteAdministrador();
      const { data: contas } = await admin.auth.admin.listUsers({ perPage: 1000 });
      for (const conta of contas?.users ?? []) {
        if (conta.email) emails.set(conta.id, conta.email);
      }
    } catch {
      /* sem a chave de administração: o e-mail fica nulo */
    }

    return {
      dados: linhas.map((l) => ({
        id: l.id,
        nome: l.full_name,
        email: emails.get(l.id) ?? null,
        telefone: l.phone,
        ativo: l.active,
        criadoEm: l.created_at,
      })),
      erro: null,
    };
  } catch {
    return { dados: [], erro: "Não foi possível falar com o banco de dados." };
  }
}

/**
 * Cria o acesso do gestor.
 *
 * A ORDEM importa: o usuário do Auth entra primeiro, e só depois a linha em
 * `client_users`. Se a segunda falhar, sobra uma conta no Auth que não alcança
 * nada — ela não é `profile` nem `client_user`, então cai em `/sem-acesso`. É
 * ruim, mas é recuperável. O inverso — linha em `client_users` apontando para
 * um usuário que não existe — quebraria a consulta da sessão para sempre.
 *
 * Por isso, se a segunda escrita falhar, a conta do Auth é REMOVIDA.
 */
export async function criarAcessoDoPortal(
  clienteId: string,
  dados: { nome: string; email: string; telefone: string | null; senha: string },
  autor: string,
): Promise<ResultadoEscrita<{ id: string }>> {
  const nome = dados.nome.trim();
  const endereco = dados.email.trim().toLowerCase();

  if (!nome) return falha(422, "nome_vazio", "Informe o nome do gestor.", "nome");
  if (!EMAIL.test(endereco)) return falha(422, "email_invalido", "E-mail inválido.", "email");

  const problema = problemaDaSenha(dados.senha);
  if (problema) return falha(422, "senha_fraca", problema, "senha");

  let contaId: string | null = null;

  try {
    const admin = clienteAdministrador();

    const { data: criada, error: erroAuth } = await admin.auth.admin.createUser({
      email: endereco,
      password: dados.senha,
      // Já nasce confirmado, senão o gestor não entra no primeiro acesso.
      email_confirm: true,
      user_metadata: { full_name: nome, portal_client_id: clienteId },
    });

    if (erroAuth) {
      if (/already been registered|already exists/i.test(erroAuth.message)) {
        return falha(
          422,
          "ja_existe",
          "Já existe uma conta com este e-mail. Se for o mesmo gestor em outro CNPJ, use um e-mail diferente.",
          "email",
        );
      }
      return falha(500, "criacao_falhou", "Não foi possível criar o acesso.");
    }

    contaId = criada.user?.id ?? null;
    if (!contaId) return falha(500, "criacao_falhou", "Não foi possível criar o acesso.");

    // `client_users` é escrita de quem pode alterar cliente — a política
    // `client_users_write` pede `can_write()`. Vai pelo cliente da SESSÃO, e
    // não pela chave de administração: a RLS confere quem está criando.
    const supabase = await clienteServidor();
    const { error: erroLinha } = await supabase.from("client_users").insert({
      id: contaId,
      client_id: clienteId,
      full_name: nome,
      phone: dados.telefone,
      created_by: autor,
    });

    if (erroLinha) {
      // Desfaz a conta: conta do Auth sem linha em `client_users` é uma pessoa
      // que entra e não alcança nada.
      await admin.auth.admin.deleteUser(contaId).catch(() => null);
      return falha(500, "vinculo_falhou", "Não foi possível vincular o acesso ao cliente. Tente de novo.");
    }

    return { ok: true, dados: { id: contaId } };
  } catch {
    if (contaId) {
      await clienteAdministrador().auth.admin.deleteUser(contaId).catch(() => null);
    }
    return falha(503, "sem_chave", "Criar acesso exige a chave de administração configurada.");
  }
}

/** Troca a senha do gestor. Ela aparece UMA vez na tela, para entregar em mão. */
export async function redefinirSenhaDoPortal(
  usuarioId: string,
  senha: string,
): Promise<ResultadoEscrita<null>> {
  const problema = problemaDaSenha(senha);
  if (problema) return falha(422, "senha_fraca", problema, "senha");

  try {
    const admin = clienteAdministrador();
    const { error } = await admin.auth.admin.updateUserById(usuarioId, {
      password: senha,
      // Tira o banimento junto, se houver: a senha nova é o que destrava.
      ban_duration: "none",
    });

    if (error) return falha(500, "senha_falhou", "Não foi possível trocar a senha.");
    return { ok: true, dados: null };
  } catch {
    return falha(503, "sem_chave", "Trocar a senha exige a chave de administração configurada.");
  }
}

/**
 * Liga e desliga o acesso.
 *
 * Desativar, nunca apagar: `control_events.actor_client_user_id` e
 * `client_files.uploaded_by_client_user` apontam para esta linha. Apagar o
 * gestor deixaria sem autor justamente a planilha que ele enviou — e saber quem
 * enviou é o que resolve a dúvida de "esse número veio de onde?" três meses
 * depois.
 */
export async function definirAcessoAtivo(
  usuarioId: string,
  ativo: boolean,
): Promise<ResultadoEscrita<null>> {
  try {
    const supabase = await clienteServidor();
    const { error, count } = await supabase
      .from("client_users")
      .update({ active: ativo }, { count: "exact" })
      .eq("id", usuarioId);

    if (error) return falha(500, "atualizar_falhou", "Não foi possível mudar o acesso.");
    if (!count) return falha(404, "acesso_inexistente", "Este acesso não existe.");
    return { ok: true, dados: null };
  } catch {
    return falha(503, "sem_banco", "Não foi possível falar com o banco de dados.");
  }
}

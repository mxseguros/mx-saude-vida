import "server-only";

import { clienteServidor } from "../supabase/servidor";
import { clienteAdministrador } from "../supabase/administrador";
import { deCanal, deModelo, dePapel } from "../dominio/mapear";
import { problemaDaSenha } from "../dominio/senha";
import { variaveisComUmaChaveSo, variaveisInvalidas, type Canal } from "../dominio/mensagem";
import type { ModeloDeMensagem } from "../dominio/controle";
import type { Papel } from "../dominio/tipos";
import type { Falha, ResultadoEscrita } from "../clientes/servico";

/**
 * Escrita de Configurações.
 *
 * Só administrador chega aqui: a RLS barra, e `exigirAdmin` barra de novo na
 * rota. A guarda em três camadas não é exagero — é o que impede a tela abrir
 * cheia de botões que vão todos falhar.
 *
 * Uma regra atravessa tudo: **o sistema nunca pode ficar sem administrador
 * ativo**. Um sistema sem admin não tem como voltar a ter um, porque ninguém
 * consegue promover ninguém. Por isso rebaixar, desativar e excluir o último
 * admin são recusados com a mesma resposta.
 */

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function falha(status: number, codigo: string, mensagem: string, campo?: string): { ok: false; falha: Falha } {
  return { ok: false, falha: { status, codigo, mensagem, campo } };
}

function semBanco(): { ok: false; falha: Falha } {
  return falha(503, "sem_banco", "Não foi possível falar com o banco de dados.");
}

/* --------------------------------------------------------------------------
   Equipe
   -------------------------------------------------------------------------- */

/**
 * Recusa quando `id` é o último administrador ativo.
 *
 * Devolve `null` quando pode seguir. A conferência é sempre a mesma e mora num
 * lugar só: três chamadores, três chances de escrever a condição ao contrário.
 */
async function ultimoAdmin(
  supabase: Awaited<ReturnType<typeof clienteServidor>>,
  id: string,
  acao: string,
): Promise<{ ok: false; falha: Falha } | null> {
  const { data: pessoa } = await supabase.from("profiles").select("role, active").eq("id", id).maybeSingle();
  const atual = pessoa as { role: string; active: boolean } | null;
  if (atual?.role !== "admin" || !atual.active) return null;

  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin")
    .eq("active", true);

  if ((count ?? 0) > 1) return null;
  return falha(
    422,
    "ultimo_admin",
    `Este é o último administrador ativo. Promova outra pessoa antes de ${acao}.`,
    "papel",
  );
}

/**
 * Cria o acesso já pronto, com a senha que o administrador definiu.
 *
 * Nada sai por e-mail: o convite dependeria de SMTP, e enquanto o Graph não
 * está ligado o convite falharia sem explicação. O administrador entrega a
 * senha em mão e a pessoa a troca depois em "Esqueci a senha".
 *
 * É o único lugar do aplicativo que usa a chave secreta, e o uso é legítimo:
 * criar usuário é operação da API de administração e não existe com a chave
 * publicável.
 */
export async function criarPessoa(
  email: string,
  nome: string,
  papel: Papel,
  senha: string,
): Promise<ResultadoEscrita<null>> {
  const endereco = email.trim().toLowerCase();
  if (!EMAIL.test(endereco)) return falha(422, "email_invalido", "E-mail inválido.", "email");
  if (!nome.trim()) return falha(422, "nome_vazio", "Informe o nome da pessoa.", "nome");

  const problema = problemaDaSenha(senha);
  if (problema) return falha(422, "senha_fraca", problema, "senha");

  try {
    const admin = clienteAdministrador();
    const { error } = await admin.auth.admin.createUser({
      email: endereco,
      password: senha,
      // Já nasce confirmado, senão a pessoa não entra no primeiro acesso.
      email_confirm: true,
      // O gatilho `handle_new_user` lê estes dois para montar o perfil.
      user_metadata: { full_name: nome.trim(), role: dePapel(papel) },
    });

    if (error) {
      if (/already been registered|already exists/i.test(error.message)) {
        return falha(422, "ja_existe", "Essa pessoa já tem acesso.", "email");
      }
      return falha(500, "criacao_falhou", "Não foi possível criar o acesso.");
    }

    return { ok: true, dados: null };
  } catch {
    return falha(503, "sem_chave", "Criar acesso exige a chave de administração configurada.");
  }
}

/**
 * Editar nome, e-mail, perfil e senha.
 *
 * Nome e perfil ficam em `profiles`; e-mail e senha ficam no Auth. São dois
 * sistemas, e por isso duas escritas — a de `profiles` vem primeiro porque é a
 * que a RLS pode recusar, e falhar antes de mexer no Auth deixa menos sujeira.
 */
export async function editarPessoa(
  id: string,
  dados: { nome?: string; email?: string; papel?: Papel; senha?: string },
  euMesmo: string,
): Promise<ResultadoEscrita<null>> {
  const nome = dados.nome?.trim();
  if (dados.nome !== undefined && !nome) return falha(422, "nome_vazio", "Informe o nome da pessoa.", "nome");

  const email = dados.email?.trim().toLowerCase();
  if (email !== undefined && !EMAIL.test(email)) return falha(422, "email_invalido", "E-mail inválido.", "email");

  if (dados.senha !== undefined) {
    const problema = problemaDaSenha(dados.senha);
    if (problema) return falha(422, "senha_fraca", problema, "senha");
  }

  // Tirar o próprio admin é o jeito mais fácil de se trancar para fora.
  if (dados.papel !== undefined && id === euMesmo && dados.papel !== "admin") {
    return falha(422, "auto_rebaixamento", "Você não pode tirar o próprio perfil de administrador.", "papel");
  }

  try {
    const supabase = await clienteServidor();

    if (dados.papel !== undefined && dados.papel !== "admin") {
      const recusa = await ultimoAdmin(supabase, id, "mudar o perfil");
      if (recusa) return recusa;
    }

    const perfil: Record<string, unknown> = {};
    if (nome !== undefined) perfil.full_name = nome;
    if (dados.papel !== undefined) perfil.role = dePapel(dados.papel);

    if (Object.keys(perfil).length) {
      const { error, count } = await supabase.from("profiles").update(perfil, { count: "exact" }).eq("id", id);
      if (error) return falha(500, "editar_falhou", "Não foi possível salvar a pessoa.");
      if (!count) return falha(404, "pessoa_inexistente", "Pessoa não encontrada.");
    }

    if (email !== undefined || dados.senha !== undefined) {
      const admin = clienteAdministrador();
      const { error } = await admin.auth.admin.updateUserById(id, {
        ...(email !== undefined ? { email, email_confirm: true } : {}),
        // Redefinir a senha é o que LIBERA quem foi trancado por três senhas
        // erradas: tira o banimento do Auth junto.
        ...(dados.senha !== undefined ? { password: dados.senha, ban_duration: "none" } : {}),
      });

      if (error) {
        if (/already been registered|already exists/i.test(error.message)) {
          return falha(422, "ja_existe", "Já existe acesso com esse e-mail.", "email");
        }
        return falha(500, "editar_falhou", "Não foi possível atualizar o acesso.");
      }

      // ...e zera a contagem no banco. Sem isto a senha nova não entraria:
      // a trava responde antes de a senha chegar a ser conferida.
      if (dados.senha !== undefined) {
        const { error: erroZerar } = await admin.rpc("zerar_falhas_de_login", { p_user: id });
        if (erroZerar) {
          return falha(
            500,
            "desbloqueio_falhou",
            "A senha foi trocada, mas o acesso continua bloqueado. Tente de novo.",
          );
        }
      }
    }

    return { ok: true, dados: null };
  } catch {
    return semBanco();
  }
}

/**
 * Tirar acesso é DESATIVAR, nunca apagar.
 *
 * `control_events.actor_profile_id` aponta para o perfil. Apagar a pessoa
 * deixaria a linha do tempo com autor nulo — "alguém conferiu esta planilha" —
 * justamente nos meses de quem saiu, que é quando saber quem fez o quê mais
 * importa. Desativar corta o acesso na hora e preserva a assinatura.
 */
export async function desativarPessoa(id: string, euMesmo: string): Promise<ResultadoEscrita<null>> {
  if (id === euMesmo) {
    return falha(422, "auto_remocao", "Você não pode remover o próprio acesso — outro administrador precisa fazer isso.");
  }

  try {
    const supabase = await clienteServidor();
    const recusa = await ultimoAdmin(supabase, id, "remover o acesso");
    if (recusa) return recusa;

    const { error, count } = await supabase
      .from("profiles")
      .update({ active: false }, { count: "exact" })
      .eq("id", id);

    if (error) return falha(500, "remover_falhou", "Não foi possível remover o acesso.");
    if (!count) return falha(404, "pessoa_inexistente", "Pessoa não encontrada.");
    return { ok: true, dados: null };
  } catch {
    return semBanco();
  }
}

/** Devolve o acesso a quem foi desativado. */
export async function reativarPessoa(id: string): Promise<ResultadoEscrita<null>> {
  try {
    const supabase = await clienteServidor();
    const { error, count } = await supabase
      .from("profiles")
      .update({ active: true }, { count: "exact" })
      .eq("id", id);

    if (error) return falha(500, "reativar_falhou", "Não foi possível reativar o acesso.");
    if (!count) return falha(404, "pessoa_inexistente", "Pessoa não encontrada.");
    return { ok: true, dados: null };
  } catch {
    return semBanco();
  }
}

/**
 * Excluir de vez — só quem NUNCA assinou nada.
 *
 * As chaves para `profiles` não têm `on delete`: é o banco que recusa apagar
 * quem tem histórico. Só que o Auth responde "Database error deleting user"
 * sem dizer qual chave recusou, então a conferência vem ANTES, tabela a
 * tabela, para a resposta ser um 409 que explica e não um 500 que assusta.
 */
export async function excluirPessoa(id: string, euMesmo: string): Promise<ResultadoEscrita<null>> {
  if (id === euMesmo) return falha(422, "auto_remocao", "Você não pode excluir o próprio acesso.");

  try {
    const supabase = await clienteServidor();
    const { data: pessoa } = await supabase.from("profiles").select("id").eq("id", id).maybeSingle();
    if (!pessoa) return falha(404, "pessoa_inexistente", "Pessoa não encontrada.");

    const recusa = await ultimoAdmin(supabase, id, "excluir");
    if (recusa) return recusa;

    const assinaturas: [string, string][] = [
      ["control_events", "actor_profile_id"],
      ["monthly_controls", "analyst_id"],
      ["monthly_controls", "received_by_profile"],
      ["monthly_controls", "checked_by"],
      ["messages", "sent_by"],
      ["message_templates", "updated_by"],
      ["client_files", "uploaded_by_profile"],
      ["ai_prompts", "created_by"],
    ];

    for (const [tabela, coluna] of assinaturas) {
      const { count } = await supabase.from(tabela).select("*", { count: "exact", head: true }).eq(coluna, id);
      if ((count ?? 0) > 0) {
        return falha(
          409,
          "tem_historico",
          "Essa pessoa já assinou ações no sistema. Desative o acesso em vez de excluir — o histórico precisa do nome dela.",
        );
      }
    }

    const admin = clienteAdministrador();
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return falha(500, "excluir_falhou", "Não foi possível excluir o acesso.");
    return { ok: true, dados: null };
  } catch {
    return semBanco();
  }
}

/* --------------------------------------------------------------------------
   Modelos de mensagem
   -------------------------------------------------------------------------- */

/**
 * Salva o texto que o cliente vai receber.
 *
 * A validação que importa é a das `{variáveis}`: um `{valor_boleto}` digitado
 * errado não quebraria nada — sairia literal, entre chaves, na mensagem que
 * chega ao gestor do cliente. Por isso a recusa nomeia cada variável que o
 * sistema não conhece, em vez de dizer "texto inválido".
 *
 * O modelo não é criado aqui: os cinco vêm do seed, com `kind` como chave
 * primária. Editar um que não existe é 404, e não um insert silencioso que
 * criaria um sexto modelo que a tela de envio nunca procuraria.
 */
export async function salvarModelo(
  modelo: ModeloDeMensagem,
  dados: { assunto?: string; corpo?: string; canalPadrao?: Canal },
  autor: string,
): Promise<ResultadoEscrita<null>> {
  const assunto = dados.assunto?.trim();
  const corpo = dados.corpo?.trim();

  if (dados.assunto !== undefined && !assunto) {
    return falha(422, "assunto_vazio", "O assunto do e-mail não pode ficar em branco.", "assunto");
  }
  if (dados.corpo !== undefined && !corpo) {
    return falha(422, "corpo_vazio", "A mensagem não pode ficar em branco.", "corpo");
  }

  if (corpo !== undefined) {
    const desconhecidas = variaveisInvalidas(corpo);
    if (desconhecidas.length) {
      return falha(
        422,
        "variavel_desconhecida",
        `O sistema não conhece ${desconhecidas.map((v) => `{{${v}}}`).join(", ")}. Sem tradução, isso sai literal na mensagem do cliente.`,
        "corpo",
      );
    }

    // `{mes}` em vez de `{{mes}}` passa pela conferência acima — ela só olha
    // chave dupla — e chega inteiro ao celular do gestor.
    const umaChaveSo = variaveisComUmaChaveSo(corpo);
    if (umaChaveSo.length) {
      return falha(
        422,
        "chave_faltando",
        `${umaChaveSo.map((v) => `{${v}}`).join(", ")} está com uma chave só. Escreva ${umaChaveSo.map((v) => `{{${v}}}`).join(", ")}.`,
        "corpo",
      );
    }
  }

  try {
    const supabase = await clienteServidor();
    const mudanca: Record<string, unknown> = { updated_by: autor };
    if (assunto !== undefined) mudanca.subject = assunto;
    if (corpo !== undefined) mudanca.body = corpo;
    if (dados.canalPadrao !== undefined) mudanca.default_channel = deCanal(dados.canalPadrao);

    const { error, count } = await supabase
      .from("message_templates")
      .update(mudanca, { count: "exact" })
      .eq("kind", deModelo(modelo));

    if (error) return falha(500, "salvar_falhou", "Não foi possível salvar o modelo.");
    if (!count) return falha(404, "modelo_inexistente", "Este modelo de mensagem não está cadastrado.");
    return { ok: true, dados: null };
  } catch {
    return semBanco();
  }
}

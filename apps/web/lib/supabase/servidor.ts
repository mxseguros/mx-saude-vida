import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

import { chavePublicavel, urlSupabase } from "../ambiente";
import { paraPessoa, type LinhaPerfil } from "../dominio/mapear";
import type { Pessoa } from "../dominio/tipos";

/** Forma que o @supabase/ssr entrega em setAll. */
type CookieParaGravar = { name: string; value: string; options: CookieOptions };

/**
 * Cliente de servidor com a sessao da pessoa logada.
 * Continua sujeito a RLS — e essa a intencao.
 */
export async function clienteServidor() {
  const armazem = await cookies();

  return createServerClient(urlSupabase(), chavePublicavel(), {
    cookies: {
      getAll() {
        return armazem.getAll();
      },
      setAll(lista: CookieParaGravar[]) {
        try {
          for (const { name, value, options } of lista) {
            armazem.set(name, value, options);
          }
        } catch {
          // Server Component nao pode escrever cookie. Server Action e Route
          // Handler podem — e e por isso que o login por senha funciona daqui.
          // O middleware ja renovou a sessao antes de chegar num Server
          // Component, entao ignorar aqui e correto.
        }
      },
    },
  });
}

/**
 * Perfil de quem esta logado, ou null.
 *
 * Nao lanca: quem chama decide o que fazer. Perfil inativo conta como null —
 * desligar alguem em Configuracoes tem que tirar o acesso na hora, sem
 * depender de a sessao expirar.
 */
/**
 * Por que o acesso NAO cabe num `Pessoa | null`.
 *
 * `perfilAtual` devolve null por tres motivos muito diferentes: nao ha sessao,
 * ha sessao mas a pessoa nao e membro ativo, ou o banco nao respondeu. As tres
 * mereciam telas diferentes e recebiam a mesma — um `redirect("/entrar")`.
 *
 * Para a segunda, isso era um LACO. O middleware chama de autenticado quem tem
 * sessao, sem olhar `profiles.active`: analista com acesso revogado passava
 * pelo middleware, a pagina via perfil nulo e mandava para /entrar, e o
 * middleware via a sessao e mandava de volta. Ela nao alcancava nem a tela de
 * login para sair — o navegador so dizia "redirecionamentos demais". E o
 * caminho para chegar la e um botao que a propria MX aperta: Configuracoes ›
 * Equipe › tirar acesso.
 *
 * Para a terceira, era uma mentira: banco fora do ar mandava a equipe inteira
 * para o login, onde entrar tambem nao funcionaria.
 */
export type SituacaoDeAcesso =
  | { estado: "ok"; perfil: Pessoa }
  | { estado: "sem_sessao" }
  | { estado: "sem_acesso" }
  | { estado: "indisponivel" };

export async function situacaoDoAcesso(): Promise<SituacaoDeAcesso> {
  let supabase;
  try {
    supabase = await clienteServidor();
  } catch {
    return { estado: "indisponivel" };
  }

  try {
    const { data: sessao } = await supabase.auth.getUser();
    if (!sessao.user) return { estado: "sem_sessao" };

    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, initials, role, active, locked_at")
      .eq("id", sessao.user.id)
      .maybeSingle();

    // Erro de consulta e ausencia de linha nao sao a mesma coisa: o primeiro e
    // o banco falando que nao conseguiu, o segundo e "esta pessoa nao e da
    // equipe". Tratar os dois como falta de acesso desloga quem so pegou uma
    // instabilidade.
    if (error) return { estado: "indisponivel" };

    const linha = data as (LinhaPerfil & { active: boolean; locked_at: string | null }) | null;
    // Bloqueado por tres senhas erradas (17/09) cai fora NA HORA, como o
    // desativado: o token ainda vale, mas o sistema nao o reconhece mais.
    if (!linha || !linha.active || linha.locked_at) return { estado: "sem_acesso" };

    const perfil = paraPessoa(linha);
    if (!perfil) return { estado: "sem_acesso" };

    return { estado: "ok", perfil };
  } catch {
    return { estado: "indisponivel" };
  }
}

export async function perfilAtual(): Promise<Pessoa | null> {
  try {
    const supabase = await clienteServidor();
    const { data: sessao } = await supabase.auth.getUser();
    if (!sessao.user) return null;

    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, initials, role, active, locked_at")
      .eq("id", sessao.user.id)
      .maybeSingle();

    if (!data || !data.active || data.locked_at) return null;

    return paraPessoa(data as LinhaPerfil);
  } catch {
    return null;
  }
}

/* --------------------------------------------------------------------------
   O SEGUNDO PÚBLICO: quem entra pelo portal do cliente
   -------------------------------------------------------------------------- */

/**
 * Quem está logado no portal.
 *
 * Mesma sessão do Auth, tabela diferente: a equipe vive em `profiles`, o
 * gestor do cliente em `client_users`. Uma pessoa está num ou no outro, nunca
 * nos dois — e é isso que decide qual moldura ela vê.
 */
export type ClienteLogado = {
  id: string;
  nome: string;
  iniciais: string;
  telefone: string | null;
  clienteId: string;
  /** Razão social, para o cabeçalho e para a revisão do envio. */
  razaoSocial: string;
  nomeFantasia: string | null;
  documento: string;
};

export type SituacaoDoCliente =
  | { estado: "ok"; cliente: ClienteLogado }
  | { estado: "sem_sessao" }
  | { estado: "sem_acesso" }
  | { estado: "indisponivel" };

/**
 * A situação de quem entrou pelo portal.
 *
 * A consulta junta `client_users` com `clients` porque as duas coisas tiram o
 * acesso: usuário desativado e CLIENTE inativado. Inativar um cliente tem de
 * fechar o portal de todos os gestores dele na hora — senão o contrato acaba e
 * a pessoa continua enviando planilha para um mês que ninguém vai abrir.
 *
 * É a mesma pergunta que `client_id_of_user()` faz no banco. As duas camadas
 * perguntam igual, de propósito.
 */
export async function situacaoDoCliente(): Promise<SituacaoDoCliente> {
  let supabase;
  try {
    supabase = await clienteServidor();
  } catch {
    return { estado: "indisponivel" };
  }

  try {
    const { data: sessao } = await supabase.auth.getUser();
    if (!sessao.user) return { estado: "sem_sessao" };

    const { data, error } = await supabase
      .from("client_users")
      .select("id, full_name, phone, active, clients(id, legal_name, trade_name, document, active, deleted_at)")
      .eq("id", sessao.user.id)
      .maybeSingle();

    // Erro de consulta não é falta de acesso: o primeiro é o banco dizendo que
    // não conseguiu, o segundo é "esta pessoa não é do portal".
    if (error) return { estado: "indisponivel" };

    const linha = data as unknown as {
      id: string;
      full_name: string;
      phone: string | null;
      active: boolean;
      clients:
        | { id: string; legal_name: string; trade_name: string | null; document: string; active: boolean; deleted_at: string | null }
        | { id: string; legal_name: string; trade_name: string | null; document: string; active: boolean; deleted_at: string | null }[]
        | null;
    } | null;

    if (!linha || !linha.active) return { estado: "sem_acesso" };

    const empresa = Array.isArray(linha.clients) ? linha.clients[0] : linha.clients;
    if (!empresa || !empresa.active || empresa.deleted_at) return { estado: "sem_acesso" };

    return {
      estado: "ok",
      cliente: {
        id: linha.id,
        nome: linha.full_name,
        iniciais: iniciaisDe(linha.full_name),
        telefone: linha.phone,
        clienteId: empresa.id,
        razaoSocial: empresa.legal_name,
        nomeFantasia: empresa.trade_name,
        documento: empresa.document,
      },
    };
  } catch {
    return { estado: "indisponivel" };
  }
}

/**
 * As iniciais, calculadas aqui.
 *
 * `profiles.initials` é coluna gerada no banco; `client_users` não tem a
 * coluna. Repetir a regra em SQL só para isso exigiria uma migration — e a
 * regra é pequena o bastante para viver no mesmo lugar que a usa.
 */
function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? "";
  const segunda = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? "") : "";
  return `${primeira}${segunda}`.toUpperCase() || "?";
}

/**
 * Qual é o público de quem está logado.
 *
 * Uma consulta a cada tabela, e não uma adivinhação: é o que a raiz usa para
 * mandar a pessoa ao lugar certo depois do login. A ordem importa pouco, mas
 * `profiles` vem primeiro porque é a consulta que a equipe faz o dia inteiro.
 */
export async function publicoDaSessao(): Promise<"equipe" | "cliente" | "nenhum" | "sem_sessao" | "indisponivel"> {
  const equipe = await situacaoDoAcesso();
  if (equipe.estado === "ok") return "equipe";
  if (equipe.estado === "sem_sessao") return "sem_sessao";
  if (equipe.estado === "indisponivel") return "indisponivel";

  const cliente = await situacaoDoCliente();
  if (cliente.estado === "ok") return "cliente";
  if (cliente.estado === "indisponivel") return "indisponivel";

  return "nenhum";
}

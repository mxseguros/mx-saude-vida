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

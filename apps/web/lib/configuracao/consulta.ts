import "server-only";

import { clienteServidor } from "../supabase/servidor";
import { clienteAdministrador } from "../supabase/administrador";
import { paraCanal, paraModelo, paraPapel } from "../dominio/mapear";
import type { Canal } from "../dominio/mensagem";
import type { ModeloDeMensagem } from "../dominio/controle";
import type { Papel } from "../dominio/tipos";
import type { Resultado } from "../clientes/consulta";

/**
 * O que Configurações lê.
 *
 * Duas coisas, e nada além: quem tem acesso e o que o sistema escreve aos
 * clientes. Tudo o mais que a MX ajusta — seguradoras, regras do mês — mora no
 * cadastro do cliente, que é onde a analista já está quando pensa nisso.
 *
 * Erro de banco vira `erro` em texto e lista vazia, nunca exceção: Configurações
 * com uma aba fora do ar ainda serve para a outra.
 */

export type PessoaEquipe = {
  id: string;
  nome: string;
  iniciais: string;
  email: string | null;
  papel: Papel;
  ativa: boolean;
  /** Quando as três senhas erradas trancaram o acesso; só senha nova destranca. */
  bloqueadaEm: string | null;
};

export type ModeloSalvo = {
  modelo: ModeloDeMensagem;
  canalPadrao: Canal;
  assunto: string;
  corpo: string;
  atualizadoEm: string;
  atualizadoPor: string | null;
};

/**
 * Os e-mails, que vêm do Auth e não de `profiles`.
 *
 * O endereço do login mora em `auth.users`. Copiá-lo para `profiles` criaria
 * duas verdades que divergem na primeira troca de e-mail — e a que a tela
 * mostraria seria justamente a errada.
 *
 * Falhar aqui não derruba a página: o e-mail fica nulo e o resto da linha
 * aparece. Sem a chave de administração configurada, a aba continua servindo
 * para ver e trocar perfis.
 */
async function emailsDaEquipe(): Promise<Map<string, string>> {
  try {
    const admin = clienteAdministrador();
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    return new Map((data?.users ?? []).map((u) => [u.id, u.email ?? ""]));
  } catch {
    return new Map();
  }
}

/** A equipe da MX. Quem perdeu o acesso continua na lista, riscado. */
export async function lerEquipe(): Promise<Resultado<PessoaEquipe[]>> {
  try {
    const supabase = await clienteServidor();
    const [{ data, error }, emails] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, initials, role, active, locked_at")
        .order("active", { ascending: false })
        .order("full_name"),
      emailsDaEquipe(),
    ]);

    if (error) {
      return { dados: [], erro: "Não foi possível carregar a equipe." };
    }

    const linhas = (data ?? []) as {
      id: string;
      full_name: string;
      initials: string | null;
      role: string;
      active: boolean;
      locked_at: string | null;
    }[];

    return {
      dados: linhas.map((l) => ({
        id: l.id,
        nome: l.full_name,
        iniciais: l.initials ?? "?",
        email: emails.get(l.id) ?? null,
        papel: paraPapel(l.role),
        ativa: l.active,
        bloqueadaEm: l.locked_at,
      })),
      erro: null,
    };
  } catch {
    return { dados: [], erro: "Não foi possível falar com o banco de dados." };
  }
}

/**
 * Os cinco modelos de mensagem.
 *
 * Um por etapa que fala com o cliente, com `kind` como chave primária: não dá
 * para existirem dois modelos de boleto, e a analista nunca precisa escolher
 * qual. O seed cria os cinco; se algum sumir, a tela de envio avisa em vez de
 * mandar mensagem vazia.
 */
export async function lerModelos(): Promise<Resultado<ModeloSalvo[]>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("message_templates")
      .select("kind, default_channel, subject, body, updated_at, profiles:updated_by(full_name)");

    if (error) {
      return { dados: [], erro: "Não foi possível carregar os modelos de mensagem." };
    }

    const linhas = (data ?? []) as unknown as {
      kind: string;
      default_channel: string;
      subject: string;
      body: string;
      updated_at: string;
      profiles: { full_name: string } | { full_name: string }[] | null;
    }[];

    const modelos = linhas.map((l) => {
      const autor = Array.isArray(l.profiles) ? l.profiles[0] : l.profiles;
      return {
        modelo: paraModelo(l.kind),
        canalPadrao: paraCanal(l.default_channel),
        assunto: l.subject,
        corpo: l.body,
        atualizadoEm: l.updated_at,
        atualizadoPor: autor?.full_name ?? null,
      };
    });

    // A ordem é a do mês — informar, corte, boleto, vencimento — e a correção
    // por último, porque é a única que não tem data marcada.
    const ORDEM: ModeloDeMensagem[] = ["informar", "corte", "boleto", "vencimento", "correcao"];
    modelos.sort((a, b) => ORDEM.indexOf(a.modelo) - ORDEM.indexOf(b.modelo));

    return { dados: modelos, erro: null };
  } catch {
    return { dados: [], erro: "Não foi possível falar com o banco de dados." };
  }
}

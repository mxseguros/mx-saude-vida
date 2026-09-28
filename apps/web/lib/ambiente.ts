/**
 * Leitura das variaveis de ambiente com erro que diz o que fazer.
 *
 * "Cannot read properties of undefined" as 23h nao ajuda ninguem; o nome da
 * variavel que falta, sim.
 */

function obrigatoria(nome: string, valor: string | undefined): string {
  if (!valor) {
    throw new Error(
      `Variável de ambiente ausente: ${nome}. ` +
        `Copie .env.example para apps/web/.env.local e preencha.`,
    );
  }
  return valor;
}

export function urlSupabase(): string {
  return obrigatoria(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
}

export function chavePublicavel(): string {
  return obrigatoria(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

/**
 * Chave secreta (sb_secret_...): ignora RLS. So pode ser chamada em codigo de
 * servidor. A guarda abaixo e barata e transforma um vazamento silencioso em
 * erro alto.
 */
export function chaveSecreta(): string {
  if (typeof window !== "undefined") {
    throw new Error(
      "A chave secreta foi acessada no navegador. Ela ignora a RLS e nunca pode " +
        "sair do servidor — verifique o import que puxou este módulo para o cliente.",
    );
  }
  return obrigatoria(
    "SUPABASE_SECRET_KEY",
    process.env.SUPABASE_SECRET_KEY,
  );
}

export function urlBase(): string {
  return process.env.NEXT_PUBLIC_URL_BASE ?? "http://localhost:3000";
}

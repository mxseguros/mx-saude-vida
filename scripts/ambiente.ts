/**
 * Carrega `apps/web/.env.local` no `process.env` quando a variável ainda não
 * está no ambiente. Mesmo comportamento do `banco.mjs`: ter que exportar à
 * mão antes de cada comando é o passo que se esquece — e esquecer, aqui, é
 * apontar para o banco errado.
 *
 * Devolve de onde veio a configuração, para o script dizer contra o que vai
 * rodar antes de rodar.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_LOCAL = join(RAIZ, "apps", "web", ".env.local");

export function carregarAmbiente(): "ambiente" | ".env.local" | null {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) {
    return "ambiente";
  }
  if (!existsSync(ENV_LOCAL)) return null;

  for (const linha of readFileSync(ENV_LOCAL, "utf8").split(/\r?\n/)) {
    const corte = linha.indexOf("=");
    if (corte === -1 || linha.trimStart().startsWith("#")) continue;

    const nome = linha.slice(0, corte).trim();
    const valor = linha
      .slice(corte + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (nome && valor && !process.env[nome]) process.env[nome] = valor;
  }

  return process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY
    ? ".env.local"
    : null;
}

/** Só o host, para o log dizer contra o que rodou sem vazar nada. */
export function hostDe(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "(url ilegível)";
  }
}

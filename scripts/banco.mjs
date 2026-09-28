#!/usr/bin/env node
/**
 * Comandos de banco: migrar, status, semear, rls.
 *
 * POR QUE ISTO EXISTE. Os scripts do `package.json` usavam `"$SUPABASE_DB_URL"`
 * direto na linha de comando. Isso funciona em shell POSIX e NAO funciona no
 * Windows, onde o pnpm executa por `cmd.exe` e a string chega literal — o CLI
 * recebe o texto `$SUPABASE_DB_URL` e falha a leitura da connection string.
 *
 * O `teste:rls` carregava esse defeito desde a Fase 0. Ninguem notou porque
 * nunca houve banco para roda-lo: um portao de aceite escrito num comando que
 * nao executava na maquina de quem o escreveu.
 *
 * Aqui a variavel e lida em Node e passada como ARGUMENTO ja resolvido, entao
 * o comportamento e o mesmo nesta maquina e no runner.
 *
 * Tambem carrega `apps/web/.env.local` quando a variavel nao esta no ambiente.
 * Ter que exportar a mao antes de cada comando e o tipo de passo que se
 * esquece — e esquecer, aqui, e apontar para o banco errado.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_LOCAL = join(RAIZ, "apps", "web", ".env.local");

function carregarEnvLocal() {
  if (process.env.SUPABASE_DB_URL) return "ambiente";
  if (!existsSync(ENV_LOCAL)) return null;

  for (const linha of readFileSync(ENV_LOCAL, "utf8").split(/\r?\n/)) {
    const corte = linha.indexOf("=");
    if (corte === -1 || linha.trimStart().startsWith("#")) continue;

    const nome = linha.slice(0, corte).trim();
    const valor = linha.slice(corte + 1).trim();
    if (nome && valor && !process.env[nome]) process.env[nome] = valor;
  }

  return process.env.SUPABASE_DB_URL ? ".env.local" : null;
}

/**
 * O comando existe no PATH?
 *
 * Precisa ser perguntado ANTES de executar. Com `shell: true` no Windows, um
 * binario ausente nao vira `ENOENT`: vira "nao e reconhecido como um comando"
 * com status 1, indistinguivel de uma falha de conexao. A dica util nunca
 * apareceria.
 */
function existeNoPath(comando) {
  const busca = spawnSync(process.platform === "win32" ? "where" : "which", [comando], {
    stdio: "ignore",
    shell: false,
  });
  return busca.status === 0;
}

/** So o host, para o log dizer contra o que rodou sem vazar a senha. */
function hostDe(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}`;
  } catch {
    return "(connection string ilegivel)";
  }
}

const CLI = {
  migrar: (url) => ["db", "push", "--db-url", url],
  status: (url) => ["migration", "list", "--db-url", url],
  semear: (url) => ["db", "push", "--db-url", url, "--include-seed"],
};

const ACOES = [...Object.keys(CLI), "rls"];

const acao = process.argv[2];

if (!acao || !ACOES.includes(acao)) {
  console.error(`Uso: node scripts/banco.mjs <${ACOES.join("|")}>`);
  process.exit(1);
}

const origem = carregarEnvLocal();

if (!origem) {
  console.error(
    [
      "Falta SUPABASE_DB_URL.",
      "  Esta no painel do Supabase, em Project Settings > Database >",
      "  Connection string > URI.",
      `  Ponha em ${ENV_LOCAL} ou exporte no ambiente.`,
    ].join("\n"),
  );
  process.exit(1);
}

const url = process.env.SUPABASE_DB_URL;

/**
 * O teste de RLS nao passa pelo CLI do Supabase: e um arquivo .sql com
 * meta-comandos do psql (ON_ERROR_STOP), entao precisa do psql mesmo.
 */
const alvo =
  acao === "rls"
    ? {
        binario: "psql",
        args: [url, "-v", "ON_ERROR_STOP=1", "-f", "supabase/tests/rls.sql"],
        rotulo: "psql ... -f supabase/tests/rls.sql",
      }
    : {
        binario: join(
          RAIZ,
          "node_modules",
          ".bin",
          process.platform === "win32" ? "supabase.CMD" : "supabase",
        ),
        args: CLI[acao](url),
        rotulo: `supabase ${CLI[acao]("...").join(" ")}`,
      };

// Diz CONTRA O QUE vai rodar, antes de rodar. `db push` aplica DDL; saber que
// se esta apontando para producao e a diferenca entre um comando e um
// incidente.
console.log(`banco:    ${hostDe(url)}`);
console.log(`fonte:    ${origem}`);
console.log(`ambiente: ${process.env.SUPABASE_DB_ENV ?? "(nao declarado)"}`);
console.log(`comando:  ${alvo.rotulo}`);
console.log("");

if (acao === "rls" && !existeNoPath("psql")) {
  console.error(
    [
      "`psql` nao encontrado. Ele nao vem com o projeto.",
      "  Rode pelo workflow `Banco` (acao: rls), no runner do GitHub —",
      "  onde o psql existe e as portas do Postgres nao estao bloqueadas.",
    ].join("\n"),
  );
  process.exit(1);
}

// Aspas no binario quando o shell entra: o caminho de node_modules passa por
// um nome com espaco, e sem aspas o cmd corta no espaco e tenta executar
// so a primeira metade do caminho.
const precisaDeShell = process.platform === "win32";
const comando = precisaDeShell ? `"${alvo.binario}"` : alvo.binario;

const resultado = spawnSync(comando, alvo.args, {
  stdio: "inherit",
  cwd: RAIZ,
  shell: precisaDeShell,
});

if (resultado.error?.code === "ENOENT") {
  console.error("\nCLI do Supabase nao encontrado. Rode `corepack pnpm install`.");
  process.exit(1);
}

process.exit(resultado.status ?? 1);

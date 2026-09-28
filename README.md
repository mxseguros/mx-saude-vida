# MX SaúdeVida

Controle mensal de seguros saúde, vida e odonto da MX Corretora de Seguros.

O sistema tem três partes:

- **Cadastro do cliente**: empresa, apólice lida do PDF, regras do mês (informar até, corte, emissão do boleto, vencimento) e o canal de aviso.
- **Controle mensal**: uma linha por cliente, com as quatro datas do mês, o passo em que cada um está e o envio da mensagem do passo atual, por e-mail ou WhatsApp.
- **Portal do cliente**: o cliente entra com login, envia a planilha do mês e encontra seus boletos e documentos.

## Este repositório é público

Nenhum dado de cliente entra aqui: nome, CNPJ, CPF, e-mail, telefone, planilha, apólice ou boleto. Seeds, fixtures e testes usam só dados sintéticos. O material de trabalho fica numa pasta `Docs/` local, fora do git.

## Stack

Next.js 15 (App Router) · React 19 · Tailwind CSS v4 · Supabase (Postgres com RLS, Auth, Storage) · zod · Vitest · Playwright · GitHub Actions · Vercel.

A base foi clonada por cópia do MX Sinistro, sistema irmão da MX. Não há dependência entre os repositórios.

## Rodar localmente

Requer Node 24 e pnpm via corepack.

```bash
corepack pnpm install
cp .env.example apps/web/.env.local   # e preencha
corepack pnpm dev
```

| Comando | O que faz |
|---|---|
| `corepack pnpm dev` | servidor de desenvolvimento |
| `corepack pnpm lint` | ESLint |
| `corepack pnpm typecheck` | TypeScript, sem emitir |
| `corepack pnpm test` | testes unitários (Vitest) |
| `corepack pnpm build` | build de produção |
| `corepack pnpm --filter @mx/saudevida-web e2e` | fumaça com Playwright, sem banco |
| `corepack pnpm migrar` | aplica as migrations pendentes |
| `corepack pnpm teste:rls` | teste das políticas de acesso |

## Estrutura

```
apps/web/
  app/(sistema)/    telas da equipe: controle, clientes, configurações
  app/(portal)/     telas do cliente: painel, enviar planilha, documentos
  app/entrar/       login único; o destino depende do perfil
  app/api/          v1 (equipe), portal (cliente), cron, auth
  componentes/ui/   botão, campo, modal, gaveta, stepper
  lib/dominio/      regras puras, compartilhadas entre navegador e servidor
  lib/              supabase, email, api, log
  testes/           Vitest
  e2e/              Playwright
supabase/           migrations, seed sintético, teste de RLS
scripts/            banco e carga
documentacao/       plano de desenvolvimento
```

## Plano

O plano de desenvolvimento, com as sprints e os critérios de aceite, está em [documentacao/plano-de-desenvolvimento.md](documentacao/plano-de-desenvolvimento.md).

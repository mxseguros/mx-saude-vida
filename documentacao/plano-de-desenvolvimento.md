# MX SaúdeVida — Plano de desenvolvimento v1.0

Aprovado em 28/09/2026. Referência de tela: protótipo v0.8 (material interno, fora do repositório). Em dúvida de layout, o protótipo vence o texto.

Decisões de base: repositório público, logo nenhum dado de cliente entra no código; WhatsApp enviado pela analista com um clique (link `wa.me` com o texto pronto) e e-mail enviado pelo servidor; um projeto Supabase, com produção como palco de ensaio até o go-live.

## 1. Contexto

O MX SaúdeVida substitui o CONTROLE FATURAS em Excel por um sistema com três partes: **cadastro do cliente** (empresa, apólice lida do PDF, Regras do mês com quatro datas, canal de aviso), **Controle mensal** que abre uma linha por cliente todo mês e avisa o cliente em cada data (Informar até, Corte, Boleto, Vencimento) por e-mail e WhatsApp com mensagens configuráveis, e **portal do cliente** com login, onde ele envia a planilha do mês (Dados · Planilha · Revisão) e guarda seus documentos. A analista confere a planilha, anexa o boleto e o Controle avança. Nove telas, um fluxo.

Base a clonar **por cópia** (nunca dependência entre repos): o app do **MX Sinistro**: Next 15 + React 19 + Tailwind v4 + Supabase (SSR, RLS, Storage) + zod + Anthropic SDK + unpdf + vitest + Playwright, CI e backup no GitHub Actions, deploy na Vercel. Inventário de reuso na seção 8.

## 2. Arquitetura

- **Monorepo pnpm** `apps/web` (igual ao Sinistro). Node 24, `corepack pnpm`.
- **Dois públicos, um app**: grupo `(sistema)` para a MX (Controle, Clientes, Configurações) e grupo `(portal)` para o cliente (Painel, Enviar planilha, Meus documentos), cada um com sua moldura. Login único em `/entrar`; o destino depende do perfil (staff → `/controle`, cliente → `/portal`).
- **Banco e API em inglês, app em português** (regra do Sinistro, tradução só em `lib/dominio/mapear.ts`).
- **Toda escrita vira evento** (`control_events`, append-only por RLS); se o evento falhar, a mudança reverte.
- **Arquivos** em bucket privado `client-files` (planilhas, boletos, apólice), URL assinada de 2 minutos, upload com o cliente da sessão.
- **Mensagens**: modelos em tabela (`message_templates`, editáveis em Configurações); e-mail enviado pelo servidor (Graph → Resend, `lib/email/*` do Sinistro); WhatsApp = link `wa.me` com o texto renderizado, aberto no clique da analista; tudo registrado em `messages`.
- **Cron diário** `/api/cron/mensal` (Vercel, `0 10 * * *` = 07h BRT, `CRON_SECRET`, idempotente por data): abre os controles do mês, envia os e-mails das datas do dia, marca os WhatsApps pendentes do dia, avança passos automáticos, aplica retenção.
- **IA**: só a leitura do PDF da apólice (`lib/ia/apolice.ts` do Sinistro, Claude Haiku via Anthropic SDK, extração validada por zod, prompt versionado, teto diário, cache por hash). A conferência da planilha é código (parser xlsx + regras), sem LLM.
- **Deploy**: projeto Vercel `mx-saude-vida`, root `apps/web`, região `gru1`, domínio `saudevida-mx.vercel.app`; push na `main` publica.

## 3. Modelo de dados (Supabase / Postgres)

```
profiles(id = auth.users.id, name, role user_role[admin|analyst|reader], is_active, failed_logins, locked_at)
client_users(id = auth.users.id, client_id FK, name, phone, is_active)           -- acesso do cliente ao portal
insurers(id, name, is_active)                                                    -- lista editável (seed com as seguradoras em uso)
clients(id, legal_name, cnpj UNIQUE, trade_name, insurer_id FK, product_type enum[health|life|dental|global|transport|vg],
        notes, billing_email, channel enum[whatsapp|email|both], manager_name, manager_phone, manager_email,
        inform_day int, cutoff_day int, invoice_day int, due_day int,           -- Regras do mês (dia do mês)
        is_active, deleted_at, created_at)
policies(id, client_id FK, policy_number, contract_number, product_name, valid_from, valid_to,
         capital_rule jsonb, rate_per_mille numeric, age_limit int, pdf_file_id FK, extracted_by_ai_run FK, created_at)
monthly_controls(id, client_id FK, competence date, step control_step
        [inform|spreadsheet_received|checked|cutoff|invoice|due|done],
        inform_date, cutoff_date, invoice_date, due_date,                        -- datas do mês, congeladas na abertura
        spreadsheet_file_id FK, received_at, received_by client_user FK, received_note,
        checked_at, checked_by profile FK, check_note, correction_requested_at,
        invoice_file_id FK, invoice_amount, invoice_number, invoice_due,
        paid_at, last_message_id FK, UNIQUE(client_id, competence))
control_events(id, control_id FK, actor_profile_id, actor_client_user_id, type enum, payload jsonb, created_at)  -- append-only
message_templates(id, step enum[inform|cutoff|invoice|due|correction], default_channel, body text, updated_by, updated_at)
messages(id, control_id FK, step, channel enum[email|whatsapp], to_address, body, status enum[sent|opened_link|failed|pending],
         sent_at, sent_by profile FK)
client_files(id, client_id FK, control_id FK null, kind enum[spreadsheet|invoice|policy], storage_path, original_name,
             size, mime, uploaded_by_profile FK null, uploaded_by_client_user FK null, deleted_at, created_at)
ai_prompts, ai_runs (copiadas do Sinistro)  ·  cron_runs(run_date PK, summary jsonb)
```

- **RLS**: `is_active_member()` (staff) vê tudo; `is_admin()` para Configurações e inativar cliente; `client_id_of_user()` restringe `client_users` a `clients`, `monthly_controls`, `client_files` e `messages` do próprio `client_id`; nenhuma política para `anon`. Cliente **não** lê `control_events` nem `message_templates`. `control_events` e `messages` sem update/delete.
- **Views** `security_invoker`: `v_control_board` (linha do Controle com cliente, datas, passo, última mensagem, contadores de prazo), `v_client_documents`.
- **Máquina de passos** (função pura `lib/dominio/controle.ts`, testada):
  - `inform` → `spreadsheet_received` (upload pelo portal ou pela analista) → `checked` (analista) → `cutoff` (automático na `cutoff_date`, ou imediato se já passou) → `invoice` (analista anexa o boleto) → `due` (automático 3 dias antes de `due_date`) → `done` (analista marca pago, ou automático em `due_date + 5` com aviso).
  - "Pedir correção" volta de `spreadsheet_received` para `inform` e registra `correction_requested_at`.
  - "Não houve mudanças" no portal = `spreadsheet_received` sem arquivo, com `received_note='sem alterações'`.
- **Datas**: `inform_date = competence com dia inform_day`; se o dia não existir no mês, último dia. Vencimento no mês seguinte quando `due_day < invoice_day`.

## 4. Telas → rotas (do protótipo v0.8)

| Tela (protótipo) | Rota | Observações |
|---|---|---|
| Login | `/entrar` | copiado do Sinistro; destino por perfil; bloqueio na 3ª senha |
| Controle mensal | `/controle` (padrão da MX) | tabela `v_control_board` sem rolagem lateral; 4 contadores; vistas Lista · Mês · Semana; "Enviar mensagem" abre modal com texto renderizado, botão WhatsApp (`wa.me`) e/ou e-mail; "Conferir planilha" |
| Clientes | `/clientes` | CRUD; inativar = `deleted_at` |
| Cliente | `/clientes/[id]` | abas Cadastro e apólice (upload PDF → IA preenche ✦), Movimentações, Documentos, Boletos (Anexar boleto → mensagem) |
| Conferir planilha | `/controle/[id]/conferir` | prévia das linhas (parser xlsx no servidor), linha com campo em branco em amarelo, observação; "Pedir correção" / "Conferida · avançar" |
| Configurações | `/configuracoes` | Usuários (equipe do Sinistro), Mensagens (5 modelos, variáveis, prévia), Modelo de planilha, Prompt da apólice |
| Painel do cliente | `/portal` | pendência do mês, 4 datas, contrato, atalho Meus documentos |
| Enviar planilha | `/portal/enviar` | wizard 3 etapas com o stepper em pílulas; upload por XHR com progresso; "Não houve mudanças" |
| Meus documentos | `/portal/documentos` | por mês: planilha (protocolo, status), boleto, apólice; download por URL assinada |

Rotas de API: `app/api/v1/{clientes,controles,mensagens,arquivos,configuracao}` para staff (`exigirPerfil/Admin`), `app/api/portal/*` para `client_users` (sessão + `client_id_of_user()`), `app/api/cron/mensal`, `app/api/auth/email` (gancho do Supabase para redefinição de senha).

## 5. Sprints (2 semanas · início 05/10/2026)

| Sprint | Datas | Entrega | Conteúdo | Aceite |
|---|---|---|---|---|
| **S0 · Setup** | 29/09–02/10 | Repo pronto | Clonar por cópia o esqueleto do Sinistro (seção 8), renomear (`@mx/saudevida-web`, `saudevida-mx`), `.gitignore` bloqueando xlsx/csv/pdf, CLAUDE.md reescrito, projeto Supabase + Vercel criados, secrets no GitHub (`SUPABASE_DB_URL_PROD`, `VERCEL_*`, `BACKUP_PASSPHRASE`), CI verde num commit vazio | `pnpm lint/typecheck/test/build` verdes; `banco.yml status` conecta |
| **S1 · Fundação + Clientes** | 05–16/10 | Login, moldura, Clientes e apólice | migrations base + rls + arquivos; auth e bloqueio; moldura `(sistema)`; CRUD Clientes (busca, filtros, inativar); Cliente com Cadastro e apólice, Regras do mês, Canal de aviso, Acesso ao portal (cria `client_user` e envia senha); leitura do PDF da apólice pela IA; seed sintético de 30 clientes | base atual importável por script local (fora do git); apólice real lida com ≥ 7 campos certos; teste de RLS verde |
| **S2 · Controle + mensagens** | 19–30/10 | O Controle substitui o Excel | `monthly_controls` + eventos + máquina de passos; abertura automática pelo cron; `v_control_board`; tela Controle (Lista, contadores, cores de prazo, sem rolagem); modelos de mensagem + renderização de variáveis; modal Enviar mensagem (e-mail via Graph/Resend, WhatsApp via wa.me) com registro em `messages`; cron enviando e-mails nas datas e listando WhatsApps do dia; Configurações › Usuários e Mensagens | Competência **Novembro/2026** aberta com todos os clientes; e-mail real chega; WhatsApp abre com o texto certo; **go-live parcial: o time para de duplicar a planilha** (portão G1) |
| **S3 · Portal do cliente** | 02–13/11 | Cliente envia a planilha | grupo `(portal)`, moldura e login por perfil; Painel; Enviar planilha (3 etapas, upload XHR, "Não houve mudanças"); Meus documentos; RLS de `client_users`; gancho de e-mail para senha; ao enviar: passo `spreadsheet_received`, evento, aviso à analista | Cliente de teste envia planilha pelo celular; analista vê no Controle; cliente não enxerga outro cliente (teste de RLS) |
| **S4 · Conferir + Boletos** | 16–27/11 | Ciclo completo até o boleto | parser xlsx (SheetJS) com prévia e detecção de campo em branco; tela Conferir planilha; Pedir correção (mensagem + volta de passo); Anexar boleto (leitura do PDF: parcela, valor, vencimento) + mensagem Boleto com anexo; passo `due` e `done`; aba Boletos e Documentos do cliente | Um cliente percorre inform → done inteiro no sistema; boleto aparece em Meus documentos |
| **S5 · Mês/Semana + paralelo** | 30/11–11/12 | v1 operável | vistas Mês e Semana; retenção LGPD; backup provado; provas Playwright contra produção; **paralelo com o Excel na competência Dezembro/2026**; ajustes | Totais e datas iguais ao Excel; nenhum alerta perdido (portão G2) |
| **S6 · Virada** | 14–23/12 | Go-live | `ensaio_zerar()`, carga real dos clientes (script local), criação dos acessos dos clientes por ondas (10 → 30 → todos), treinamento de 1 h, Excel congelado | Competência **Janeiro/2027** 100% no sistema |

Dependências externas por sprint: S0 contas Supabase/Vercel e caixa de e-mail (Graph) · S1 lista final de seguradoras e 3 apólices PDF de cias diferentes · S2 textos finais das 5 mensagens · S3 dois clientes voluntários para o portal · S5 planilha de dezembro em paralelo.

## 6. Estrutura de pastas

```
apps/web/
  app/(sistema)/{controle,clientes,configuracoes}/…   app/(portal)/{portal,portal/enviar,portal/documentos}/…
  app/entrar · app/sem-acesso · app/auth/confirmar
  app/api/v1/{clientes,controles,mensagens,arquivos,configuracao,apolice}  app/api/portal/{controle,arquivo}  app/api/cron/mensal  app/api/auth/email
  componentes/ui/ (copiados) · componentes/marca.tsx
  lib/dominio/{controle,mensagem,cliente,planilha,apolice-campos,convite,documento,telefone,mascaras,senha,bloqueio,destino,mapear}.ts
  lib/{supabase,email,ia,arquivos,clientes,controles,mensagens,configuracao,api,log,ambiente}
  testes/*.test.ts · e2e/fumaca.spec.ts · provas/*.mjs
supabase/migrations · supabase/seed.sql (sintético) · supabase/tests/rls.sql
scripts/{banco.mjs,ambiente.ts,gerar-base-sintetica.ts,ensaio.ts,importar-clientes.ts}
.github/workflows/{ci,e2e,banco,backup,publicar}.yml · Docs/ (planos, protótipo, brand)
```

## 7. Convenções (CLAUDE.md do novo repo)

Herda as 24 regras do Sinistro (inglês no banco, português no app; listas em tabela; zod compartilhado; evento append-only; remover é desativar; bucket privado; funções que escrevem checam papel; middleware nunca lança; rotas públicas fora de `/api/v1`; IA propõe e código decide; log sem PII; retenção; CSV seguro; nada de dado real em dev; celular primeiro; E2E por função). Acrescenta: **repo público → nenhum nome, CNPJ, e-mail ou telefone real em código, seed, fixture, teste ou commit**; xlsx/csv/pdf no `.gitignore`; scripts de importação leem a planilha de fora do repositório; CTAs em três cores (Azul MX, Areia MX com fonte branca, verde/vermelho só em alerta); prazo vencido = fonte vermelha, nunca fundo; tabelas sem rolagem lateral.

## 8. Reuso do MX Sinistro (caminhos relativos a `apps/web` do projeto de origem)

**Copiar como está**: `package.json`/`pnpm-workspace.yaml`/`tsconfig.json`/`next.config.ts`/`postcss.config.mjs`/`eslint.config.mjs`/`vitest.config.ts`/`playwright.config.ts`; `lib/{ambiente,log,api}.ts`; `lib/supabase/*`; `lib/email/*` (Graph → Resend); `lib/dominio/{webhook,email-auth,senha,bloqueio,destino,telefone,documento,mascaras,csv,quando}.ts`; `app/api/auth/email`, `app/auth/confirmar`, `app/entrar/*`, `app/sem-acesso`, `app/{error,global-error,not-found}.tsx`, `app/manifest.ts`; `componentes/ui/{botao,campo,modal,gaveta,foco,aviso,avatar,stepper,resumo,fotos}.tsx`; `_admin/{tema,alternador-menu,menu-mobile,icones}.tsx`; workflows `ci/e2e/banco/publicar/backup` (trocar IDs e lista de tabelas); `scripts/{banco.mjs,ambiente.ts}`; `Docs/brand/gerar-{favicon,og}.py` e assets de marca; `lib/ia/{registro,custo,hash,prompts}.ts` + `apolice.ts` (adaptar o esquema).

**Copiar e adaptar**: `middleware.ts` (`ROTAS_PROTEGIDAS` = `/controle,/clientes,/configuracoes,/portal`; destino por perfil); `app/layout.tsx` (fontes: Manrope + Source Sans 3 no sistema; Plus Jakarta Sans no portal, como a coleta); `globals.css` (tokens; bloco `.coleta-publica` vira `.portal`); `(sistema)/layout.tsx` + `_admin/{moldura,topo,navegacao,busca-global,contexto}` (sem contadores de ticket); Configurações `equipe.tsx`, `emails.tsx`→`mensagens.tsx`, `agentes.tsx`; migrations `base/rls/arquivos/retencao/bloqueio_de_login/modelos_email/ia_teto/vigia`; `seed.sql`, `tests/rls.sql`; `app/coleta/[token]/{wizard,etapas,primitivas}.tsx` → `(portal)/portal/enviar` (3 etapas) e `componentes/ui/stepper.tsx` (pílulas); `lib/dominio/whatsapp.ts` + `esteira/[board]/coleta/whatsapp.tsx` → modal Enviar mensagem; `api/cron/vigia` → `api/cron/mensal`; `lib/arquivos/servico.ts` (bucket `client-files`); `lib/clientes/*` + `novo-cliente.tsx`; `scripts/{gerar-base-sintetica,ensaio,carregar-parceiros→importar-clientes}.ts`; `e2e/fumaca.spec.ts`, `provas/comum.mjs`.

**Não copiar**: esteira/kanban, `@dnd-kit`, statuses/colunas, prioridade, terceiros, assistência, parceiros, mapa/geo, triagem, report/recharts, relatório semanal, checklist/tarefas, `chip.tsx`, provas de sinistro.

**Novo**: `lib/dominio/{controle,mensagem,planilha}.ts` (máquina de passos, renderização de `{variáveis}`, parser e regras da planilha), `lib/controles/*`, `lib/mensagens/*`, tabelas da seção 3, grupo `(portal)`, `client_users` + RLS, dependência `xlsx` (SheetJS CE) só no servidor.

## 9. Verificação

- **Unitário (vitest)**: máquina de passos (todas as transições e as automáticas por data, meses de 28/30/31 dias, vencimento no mês seguinte), renderização de mensagens (todas as variáveis, campo faltando), parser de planilha (colunas fora de ordem, campo em branco, CPF inválido), `linkWhatsapp`, provedor de e-mail.
- **RLS (`supabase/tests/rls.sql`)**: staff vê tudo; cliente A não lê controles, arquivos nem mensagens do cliente B; `anon` não lê nada; eventos e mensagens sem update/delete.
- **E2E (Playwright)**: fumaça sem banco (limites de auth, cabeçalhos, manifest); provas contra produção com acesso descartável: login staff → Controle → Enviar mensagem (e-mail chega numa caixa de teste; wa.me monta com o texto); login cliente → Enviar planilha → aparece no Controle → Conferir → Anexar boleto → aparece em Meus documentos; cron chamado manualmente com `CRON_SECRET` é idempotente.
- **CI**: `pnpm audit --prod`, lint, typecheck, test, build a cada push; `banco.yml` migra e roda o RLS test; `backup.yml` restaura e confere contagens.
- **Aceite de negócio**: paralelo com o Excel em Dezembro/2026 (S5) e competência Janeiro/2027 100% no sistema (S6).

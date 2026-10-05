# MX SaúdeVida — plano de execução v2

**Data:** 05/10/2026 · **No ar:** https://mx-saudevida.vercel.app · **Protótipo de referência:** v0.8 (o v0.7 está parado por decisão de 02/10)

Este plano substitui o cronograma do `plano-de-desenvolvimento.md` a partir daqui. O de lá continua valendo como registro do que foi combinado em 28/09; o que mudou é que **estamos cinco semanas adiantados** e o escopo das sprints 1 a 3 se revelou maior do que o planejado em alguns pontos e menor em outros.

---

## 1. Onde estamos

| Sprint | Entrega | Estado |
|---|---|---|
| S0 | Esqueleto, CI, deploy | ✅ |
| S1 | Login, Clientes, máquina de passos, RLS | ✅ *(menos a leitura da apólice por IA)* |
| S2 | Controle mensal, mensagens, Configurações, cron | ✅ |
| S3 | Portal do cliente | ✅ |
| S4 | Conferir planilha, boletos, marcar pago | ✅ |
| S5 | Vistas Mês/Semana, retenção, backup | 🟡 em andamento |

**Números:** 336 testes, 68 provas Playwright, 49 asserções de RLS, 177 clientes carregados do CONTROLE FATURAS.

**O ciclo do mês fecha de ponta a ponta:** `informar → planilha recebida → conferida → corte → boleto → vencimento → concluída`.

### O que o sistema já faz sozinho

O cron das 7h abre a competência, avança os passos que o calendário move, fecha o mês dos clientes que a seguradora cobra direto, dispara as mensagens cujo dia chegou e aplica a retenção de arquivos vencidos. A primeira execução real, em 02/10, avançou 36 meses — 31 fecharam e 5 foram para vencimento.

---

## 2. O que falta para o sistema ser usável de verdade

Esta é a parte que importa. Três coisas, e **nenhuma delas é código**.

### 2.1 E-mail — a maior

Sem provedor configurado, **nenhuma mensagem sai**. Na execução de 02/10, 8 avisos tentaram sair e falharam com `sem_provedor`. O WhatsApp funciona (a analista abre com um clique), mas o e-mail é o canal de 169 dos 177 clientes.

**Caminho A — Microsoft Graph** (preferível, usa a caixa da MX):
1. Registro de aplicativo no Entra ID
2. Permissão de **aplicativo** `Mail.Send` + consentimento do administrador
3. Um segredo de cliente
4. Uma *Application Access Policy* restringindo o aplicativo à caixa de sistemas
5. Variáveis na Vercel: `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `EMAIL_REMETENTE`, `EMAIL_RESPONDER_PARA`

**Caminho B — Resend** (mais rápido, exige domínio verificado com SPF e DKIM): só `RESEND_API_KEY`.

O código já escolhe sozinho: Graph completo ganha, senão Resend, senão nada.

### 2.2 Os 86 clientes sem contato

Da carga do CONTROLE FATURAS, **86 dos 177 não têm e-mail nem celular do gestor** — a coluna "E-MAIL" do Excel estava vazia em 65 linhas e com texto solto em 37. Eles aparecem no Controle e **não podem ser avisados**.

Não há conserto técnico: é trabalho de cadastro. Sugestão de corte: comece pelos que têm movimentação de vidas (107 em `informar`), porque são os que o sistema cobra todo mês.

### 2.3 `SUPABASE_AUTH_HOOK_SECRET`

Authentication › Hooks → `POST /api/auth/email`. Sem ele, criar acesso ao portal funciona (a senha aparece na tela para entregar em mão), mas "Esqueci a senha" não envia nada.

---

## 3. As próximas entregas

### Fase A — Fechar a S5 *(2–3 dias)*

| # | Item | Estado |
|---|---|---|
| A.1 | Vistas Mês e Semana | ✅ feito |
| A.2 | Retenção LGPD (prazos em tabela, cron apaga) | ✅ feito |
| A.3 | `backup.yml` com restauração provada | 🟡 **seis barreiras vencidas, em verificação** |
| A.4 | Provas Playwright contra produção com acesso descartável | ⬜ |
| A.5 | Base sintética no `seed.sql` (30 clientes) | ⬜ |

**Sobre o A.3:** o backup dumpa e restaura num Postgres descartável, e **confere as contagens das 11 tabelas, as views e as políticas de RLS**. Backup que perde política restaura um banco aberto, onde um cliente vê o outro. Cada barreira vencida está num commit com o motivo: versão do `pg_dump`, schema `public`, extensões, `CREATE SCHEMA` no índice, schema `auth`, chaves para `auth.users`.

### Fase B — Leitura da apólice por IA *(3–4 dias)*

Era da S1 e ficou de fora. `lib/ia/` não existe.

| # | Item |
|---|---|
| B.1 | `lib/ia/{registro,custo,hash,prompts}.ts` copiados do MX Sinistro |
| B.2 | `lib/ia/apolice.ts` com esquema zod do SaúdeVida (capital por cargo, taxa por mil, limite de idade, vigência) |
| B.3 | Upload do PDF na ficha do cliente, campo preenchido fica **destacado** até a analista revisar |
| B.4 | `ai_runs` como livro-caixa: prompt versionado, teto diário, cache por hash |

**Depende de você:** `ANTHROPIC_API_KEY` e três apólices em PDF de seguradoras diferentes. Você já tem a Prudential em `Docs/`.

**Por que vale:** 177 clientes com apólice para cadastrar à mão são semanas de digitação. E o cartão "Contrato" do portal está vazio hoje.

### Fase C — Paralelo com o Excel *(duas competências)*

O portão G2 do plano original. **Não é código — é operação.**

| # | Item |
|---|---|
| C.1 | Rodar novembro e dezembro **nos dois**: Excel e sistema |
| C.2 | Conferir ao fim de cada mês: totais, datas, nenhum aviso perdido |
| C.3 | Lista de divergências → correções no sistema |

**Aceite:** duas competências seguidas em que o sistema não perdeu nada que o Excel pegou.

### Fase D — Virada *(1 semana)*

| # | Item |
|---|---|
| D.1 | `ensaio_zerar()` e carga definitiva |
| D.2 | Acessos dos clientes por ondas: 10 → 30 → todos |
| D.3 | Treinamento de 1 h com as analistas |
| D.4 | Excel congelado |

**Aceite:** janeiro/2027 100% no sistema.

---

## 4. O que ficou fora, e por quê

| Item | Motivo |
|---|---|
| **Funcionários (CRUD) e De/Para** | Removidos na simplificação v0.8 de 28/09. Estão inventariados em `plano-v07-por-funcionalidade.md` |
| **Coleta em 5 etapas** | O portal em 3 etapas faz o mesmo trabalho; a decisão de reativar é sua |
| **Baixar base** | Depende de Funcionários |
| **Tela de Alertas com sino** | A faixa de contadores do Controle e as vistas Mês/Semana cobrem o essencial |
| **Analista por cliente** | Hoje é por mês. Mês/Semana filtrariam melhor por analista se subisse para `clients` — vale meia hora quando houver mais de uma analista usando |

---

## 5. Ordem recomendada

```
AGORA   2.1 E-mail          ← você. Destrava tudo o que o sistema já faz
        2.2 86 contatos     ← você, em paralelo
        A.3 Backup          ← eu, em verificação
        A.4 Provas em prod
        A.5 Base sintética
DEPOIS  B   Apólice por IA  ← precisa da sua chave e dos 3 PDFs
        C   Paralelo nov+dez
        D   Virada
```

**O caminho crítico não é meu, é seu.** Tudo o que falta de código é melhoria; o que falta para a MX parar de usar o Excel é o e-mail e os 86 contatos.

---

## 6. Riscos

| Risco | Consequência | Mitigação |
|---|---|---|
| **Ligar o e-mail sem revisar os contatos** | Aviso saindo para endereço errado, em nome da MX | Revisar os 86 antes; o cron registra tudo em `messages`, então dá para auditar |
| **38 clientes com vencimento suposto** | Já resolvido: viraram `mx_tracks_payment = false` e não recebem aviso de vencimento | — |
| **Node 20 deprecado na Vercel em 01/10** | Build pode parar | Já estamos em Node 22; conferir no painel |
| **Grupos com vários CNPJs** (Rofatto 13, Casa de Sucos 7) | A planilha vem com uma aba por empresa e o parser lê a primeira | A tela avisa quantas abas achou; a conciliação é da Fase B do v0.7, parada |

---

## 7. Convenções

Inalteradas, em `CLAUDE.md`. As que mais pesaram até aqui: **repositório público** (nenhum dado real em código, seed, teste ou commit — todas as fixtures são sintéticas), banco em inglês e app em português com tradução só em `mapear.ts`, evento append-only, **prazo vencido é fonte vermelha e nunca fundo**, tabela não rola de lado.

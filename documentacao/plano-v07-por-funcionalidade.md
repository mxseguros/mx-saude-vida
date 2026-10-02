# MX SaúdeVida — plano por funcionalidade (protótipo v0.7)

> **PARADO em 02/10/2026, por decisão do Gabriel: seguimos no v0.8.** Este
> documento fica como inventário do que o v0.7 pede a mais, para a avaliação
> depois. Duas descobertas dele valem **independente** da versão escolhida e
> estão anotadas na seção 1: o campo **"MX acompanha o pagamento"** (que resolve
> os 39 clientes importados com vencimento suposto) e o **analista no cliente**
> em vez de no mês.

Protótipo de referência: `Docs/MX-SaudeVida-Prototipo-v0.7.html`. **Em dúvida de layout, o protótipo vence este texto.**
Data: 02/10/2026. Estado do código: Sprints 0–3 em produção (`mx-saudevida.vercel.app`), 177 clientes carregados do CONTROLE FATURAS.

---

## 0. Antes de tudo: o v0.7 é mais largo que o código de hoje

O que está no ar segue o **v0.8**, que foi a simplificação pedida em 28/09 — ela tirou Funcionários, De/Para, Baixar base e o formulário de 5 etapas, e reduziu o portal a Dados · Planilha · Revisão. Voltar ao v0.7 **re-adiciona** essas quatro coisas.

Isso não é objeção, é o custo na mesa. Em números:

| | v0.7 | no ar hoje |
|---|---|---|
| Telas da equipe | 9 | 4 |
| Telas do cliente | 3 | 3 (fluxo diferente) |
| Regras do mês por cliente | **5 datas** | 4 datas |
| Vistas do Controle | Lista · Mês · Semana | Lista |
| Tela de alertas | sim, com sino na barra | não (4 contadores no Controle) |

**O que já está pronto e serve ao v0.7 sem mudança:** login e bloqueio, moldura do sistema, CRUD de Clientes, máquina de passos do mês, mensagens configuráveis com prévia, cron diário, RLS dos dois públicos, bucket privado, upload com progresso, Configurações › Usuários.

**O que o v0.8 entregou e o v0.7 não pede:** o portal em 3 etapas. Ele continua funcionando; a Fase 7 decide se vira o fluxo de 5 etapas do v0.7 ou fica como está.

---

## 1. A descoberta que muda o banco: são CINCO regras, não quatro

No v0.7 cada cliente tem cinco datas e dois atributos que o código não guarda hoje:

```
[cliente, cia, cobrar, corte, confirmarD1, emissão, vencimento, MX acompanha pagamento, analista]
```

| Regra do v0.7 | Coluna hoje | Situação |
|---|---|---|
| **cobrar** — dia de compartilhar o link | `inform_day` | ✅ existe |
| **corte** | `cutoff_day` | ✅ existe |
| **confirmar emissão (D+1)** | — | ❌ **falta** (`confirm_day`, anulável) |
| **emissão do boleto** | `invoice_day` | ✅ existe |
| **vencimento** | `due_day` | ✅ existe |
| **MX acompanha o pagamento** | — | ❌ **falta** (booleano) |
| **analista responsável** | `monthly_controls.analyst_id` | ⚠️ está no mês, não no cliente |

Duas consequências que valem dinheiro:

**`mx_acompanha_pagamento` resolve um problema que acabei de criar.** Na carga de hoje, 39 linhas vinham com vencimento `-`, `D/C` ou `BOLETO` e entraram com data **suposta**, marcadas com `[IMPORTACAO]`. No v0.7 essas linhas são exatamente as de `MX acompanha pagamento = false`: a seguradora cobra direto, e **nenhuma atividade de vencimento é gerada**. Com o campo, elas param de precisar de data inventada.

**`analyst_id` sobe para `clients`.** A vista Semana filtra por analista e a agenda mostra "cliente · cia · analista". Analista por mês obrigaria a reatribuir 177 clientes a cada competência.

---

## 2. O conceito novo: ATIVIDADE

Hoje o mês tem **um passo** (`informar → … → concluida`). O v0.7 mostra **cinco atividades por mês, cada uma com estado próprio** — e é isso que alimenta a vista Mês, a Semana e os Alertas:

| Atividade | Dia | Ação | Estados |
|---|---|---|---|
| Cobrar cliente | `cobrar` | Enviar link | pendente · feita · atrasada |
| Corte | `corte` | Validar | pendente · feita · atrasada |
| Confirmar emissão | `confirmarD1` | Confirmar | pendente · feita · atrasada |
| Gerar boleto | `emissão` | Anexar boleto | pendente · feita · atrasada |
| Vencimento | `vencimento` | Marcar pago | pendente · feita · atrasada |

**Decisão de arquitetura:** atividade é **derivada**, não tabela. O estado sai do que `monthly_controls` já registra (`received_at`, `checked_at`, `invoice_attached_at`, `paid_at`) cruzado com a data e com "hoje". Uma tabela de atividades seria um segundo lugar que pode divergir do passo — e divergência aqui significa a analista vendo "feita" numa coisa que não aconteceu.

A derivação mora numa função pura em `lib/dominio/atividade.ts`, testada, recebendo "hoje" por parâmetro.

---

## 3. As fases

Ordenadas por **o que a MX ganha primeiro**, não pela ordem das telas. Cada fase fecha em algo utilizável.

### Fase 1 — Controle completo ← **começamos aqui**

A tela que substitui o CONTROLE FATURAS, com as três vistas.

| # | Entrega | Detalhe |
|---|---|---|
| 1.1 | Migration das 5 regras | `confirm_day` anulável, `mx_tracks_payment` booleano, `analyst_id` em `clients`. Script que relê o CONTROLE FATURAS e apaga as datas supostas de quem é `mx_tracks_payment = false` |
| 1.2 | `lib/dominio/atividade.ts` | Deriva as 5 atividades de um mês, com estado. Puro, "hoje" por parâmetro. ~25 testes |
| 1.3 | Vista **Lista** | Colunas do v0.7: Segurado · CNPJ · Cia · Tipo · Corte · Venct · E-mail · DT envio · Observações · Próximo passo. Corte e Venct em **fonte** vermelha no dia e nos 3 anteriores, riscados quando passaram |
| 1.4 | Os 5 contadores | segurados no mês · sem movimentação · com entrada/saída · sem resposta · boletos a enviar |
| 1.5 | Faixa de alertas | 🔔 N atrasados · N para hoje · N em até 3 dias, com "Ver alertas" |
| 1.6 | Barra de ferramentas | Lista \| Mês \| Semana + busca por segurado/CNPJ + filtro Cia + (Tipo, Situação) na Lista, (Atividade, Analista) nas outras |
| 1.7 | Vista **Mês** | Grade de calendário, contagem por tipo de atividade em cada dia, dia atrasado marcado, clique no dia abre o painel lateral com as atividades |
| 1.8 | Vista **Semana** | 7 colunas de cartões, fim de semana esmaecido, cartão riscado = feita, vermelho = atrasada |

**Aceite:** a analista abre `/controle`, vê os 177 clientes na Lista, troca para Mês, clica no dia 10 e vê quem tem corte naquele dia — sem abrir o Excel.

### Fase 2 — Alertas

A tela `/alertas` e o sino na barra. Agrupamento em Atrasados · Hoje · Próximos 3 dias · Para validar, cada item com o botão da ação. Filtro por analista. Reaproveita a derivação da Fase 1 — é a mesma lista, agrupada por urgência em vez de por data.

**Aceite:** nenhum prazo vencido sem aparecer aqui. Aviso por WhatsApp à analista às 8h (atrasados e de hoje) entra no cron que já existe.

### Fase 3 — Movimentação: De/Para, Validação e boleto

As três etapas do `tMov`: o agente faz o De/Para com a base, a analista valida com **um botão** (`Validar outubro/2026`) e segue até o boleto. Depende da Fase 5 (Funcionários), porque De/Para precisa de base para comparar — **por isso a Fase 3 começa pela Validação e pelo boleto**, que não dependem, e o De/Para entra depois.

| # | Entrega |
|---|---|
| 3.1 | Parser xlsx no servidor, prévia das linhas, campo em branco em amarelo |
| 3.2 | Validação: um botão, observação, "Pedir correção" que volta o passo e manda mensagem |
| 3.3 | Anexar boleto lendo parcela, valor e vencimento do PDF |
| 3.4 | Confirmar emissão (D+1) e Marcar pago |
| 3.5 | De/Para do agente: inclusão nova · reinclusão · exclusão casada |

### Fase 4 — Coleta de movimentação (link)

`tLink` e `tFormLink`: a moldura da Nova coleta do Sinistro, bloco "Enviar formulário por WhatsApp", divisor "ou preencha agora", e o formulário em **5 etapas** (Dados · Entradas · Saídas · Planilha · Revisão) com o stepper em pílulas. Atalho "Ninguém entrou nem saiu" na etapa 1. CTA "Enviar para MX".

**Decisão pendente:** isto **substitui** o portal de 3 etapas que está no ar, ou convive com ele? Ver seção 5.

### Fase 5 — Funcionários

`tFunc`: CRUD com Adicionar, Importar planilha, Editar, Demitir (mantém histórico) e Readmitir pelo mesmo CPF. Colunas iguais ao modelo de importação: Nome · CPF · Nascimento · Cargo · Capital (pela apólice) · Setor · Gestor responsável · Admissão. Setor e Gestor são listas **com opção em branco**.

Tabela nova `employees` com RLS: a equipe vê tudo, o cliente vê só os seus. **É a tabela com mais dado pessoal do sistema** — CPF e nascimento de cada funcionário — e entra com retenção desde o primeiro dia.

### Fase 6 — Apólice pelo agente, e Configurações

| # | Entrega |
|---|---|
| 6.1 | Leitura do PDF da apólice (Claude Haiku, zod, prompt versionado, teto diário, cache por hash, `ai_runs` como livro-caixa) |
| 6.2 | Campo preenchido pelo agente aparece destacado até a analista revisar |
| 6.3 | Configurações › Setores e gestores: CRUD das duas listas, por cliente |
| 6.4 | Acesso ao portal no cadastro do cliente: cria `client_user` e envia a senha |

> **6.4 é a lacuna que trava o teste do portal hoje.** Se você quiser testar o lado do cliente antes da Fase 6, ela pode subir junto com a Fase 1 — é meio dia de trabalho.

### Fase 7 — Baixar base, e a virada

`tExport`: baixar base só dos movimentados, toda a base, ou de um cliente. Depois: retenção LGPD, backup provado, provas contra produção, paralelo com o Excel e a virada.

---

## 4. Ordem recomendada e porquê

```
Fase 1  Controle (Lista · Mês · Semana)     ← a MX para de abrir o Excel
Fase 2  Alertas                             ← nenhum prazo perdido
Fase 6.4 Acesso ao portal                   ← meio dia, destrava o teste do cliente
Fase 3  Validação e boleto                  ← o ciclo fecha até o pagamento
Fase 5  Funcionários                        ← a base que o De/Para precisa
Fase 3.5 De/Para do agente                  ← depende da Fase 5
Fase 4  Coleta em 5 etapas                  ← depois da decisão da seção 5
Fase 6  Apólice e Configurações
Fase 7  Baixar base e virada
```

As Fases 1 e 2 juntas já tiram a planilha da operação diária. É onde está o ganho, e por isso vêm primeiro.

---

## 5. Decisões que preciso de você

1. **O portal de 3 etapas que está no ar substitui ou convive com a coleta de 5 etapas do v0.7?** O v0.7 tem o cliente informando entradas e saídas nome por nome; o v0.8 tirou isso e deixou só o envio da planilha. Os dois caminhos levam ao mesmo lugar.
2. **"Confirmar emissão (D+1)" vale para quais clientes?** No protótipo é anulável e só 8 dos 24 têm. Qual a regra real?
3. **Quem é a analista de cada um dos 177 clientes?** A vista Semana e os Alertas filtram por analista. Sem isso, todos ficam sem responsável.
4. **Dia de cobrar e dia de emissão do boleto** — a carga de hoje derivou `cobrar = corte − 2` e `emissão = vencimento − 7`. Se a MX tem regra própria, ela entra na migration da Fase 1.

---

## 6. Convenções que continuam valendo

Herda tudo do `CLAUDE.md`: repositório público (nenhum dado real em código, seed, teste ou commit), banco e API em inglês com tradução só em `mapear.ts`, toda mudança vira evento append-only, remover é desativar, CTAs em Azul MX · Areia MX · verde/vermelho só em alerta, **prazo vencido é fonte vermelha e nunca fundo**, tabela não rola de lado, celular primeiro.

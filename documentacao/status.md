# Status — 07/10/2026

Leia este arquivo primeiro ao retomar. Os planos longos ficam para consulta pontual.

## No ar (mx-saudevida.vercel.app)

- Portal do cliente removido. Coleta por link: `/coleta/[token]` (gestor, sem senha, 5 etapas).
- Analista: `/controle/[id]/coleta` — WhatsApp (Gestor + Celular obrigatórios) e "ou preencha agora" em 5 etapas (tLink do v0.7), com upload da planilha.
- Entrada: Nome, CPF, Nascimento, Cargo, Salário. Saída: Nome, CPF.
- Conferir: cruza o informado com a planilha (4 apontamentos, nenhum bloqueia).
- Cliente › Apólice: upload do PDF, agente preenche (✦), analista salva. Registro da IA (`ai_runs`, teto, cache) corrigido em 06/10.
- Alertas (`/alertas`) e sino no menu com atrasados + hoje; somem quando a ação é registrada. Sem filtro por analista e sem aviso diário (decisão de 06/10).
- Ficha do cliente em abas (`?aba=`): Cadastro e apólice · Funcionários (base de vidas, demitir/readmitir, importar, capital pela apólice) · Movimentações · Boletos.
- E-mail pelo Outlook de quem envia (`mailto:`), como o WhatsApp. A rotina das 7h e o boleto anexado deixam as mensagens em Alertas › Mensagens para enviar; nada sai sem a analista clicar. O PDF do boleto baixa junto para arrastar no e-mail.
- Cliente que faz a própria movimentação (opção em Regras do mês, ou em lote na lista de Clientes): sem planilha, link nem corte; o mês começa esperando o boleto e ficam só boleto e confirmação de pagamento.
- 5ª data "Confirmar emissão" (opcional por cliente): atividade no Controle, Alertas e agenda, botão Confirmar.
- 429 testes, 90 provas Playwright, RLS e CI verdes.

## Direção

Área MX segue **fielmente o protótipo v0.7** (`Docs/`, fora do git). Área do cliente: ignorar.

## Próximos itens (ordem aprovada: 1, 2 e 3 feitos)

4. Configurações — Setores e gestores (vira lista nos Funcionários), Modelo de planilha, novo usuário em modal.
5. Baixar base.
- Depois: De/Para (cruzar movimentação com Funcionários).

## Não provado com dado real

- Gestor preenchendo o link pelo celular; upload da planilha pelo link.
- Leitura de apólice pela tela com PDF real.
- Importar a planilha real de funcionários.

## Pendências do Gabriel

- Clientes sem celular nem e-mail do gestor.

## Como rodar

- Banco: workflow `Banco` (`gh workflow run banco.yml -f acao=migrar|rls`). Não há `SUPABASE_DB_URL` local.
- Local: `corepack pnpm --filter @mx/saudevida-web test|lint|build|e2e`.
- Sem prettier no projeto: não rodar.

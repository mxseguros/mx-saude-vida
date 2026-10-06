# Item 3 — Ficha do cliente em abas e a 5ª data (para aprovação)

**07/10/2026** · Referência: protótipo v0.7, tela `tCliente` e as Regras do mês.

## O que entrega

A ficha do cliente vira quatro abas, como no protótipo:

**Cadastro e apólice · Funcionários · Movimentações · Boletos**

E as Regras do mês ganham a quinta data: **Confirmar emissão (D+1)**.

## As entregas

### 3.1 Abas na ficha (~0,5 dia)
- [ ] Barra de abas no topo da ficha; a aba fica na URL (`?aba=boletos`), então dá para mandar o link direto
- [ ] **Cadastro e apólice**: o que já existe hoje (dados, apólice com o agente, regras do mês, canal)
- [ ] **Funcionários**: a tela de ontem passa a ser a aba (com a contagem: "Funcionários · 8")

### 3.2 Aba Movimentações (~0,5 dia)
Uma linha por mês, do mais recente para o mais antigo:

| Competência | Origem | Etapa | Entradas | Saídas | Vidas | Prêmio | Conferida por |
|---|---|---|---|---|---|---|---|

- **Origem**: formulário (link) · digitado pela MX · sem movimentação · planilha
- **Vidas** e **Prêmio**: os funcionários ativos naquele mês e o prêmio pela apólice. Só para o mês atual — o sistema ainda não guarda a foto de meses passados; nos anteriores aparece "—"
- Clique na linha abre a conferência do mês

### 3.3 Aba Boletos (~0,5 dia)

| Competência | Parcela | Nosso número | Valor | Vencimento | Enviado ao cliente | Situação | |
|---|---|---|---|---|---|---|---|

- Ações: **Baixar PDF** e **Reenviar** (abre a mensagem de boleto do mês)
- **Substitui o "Acervo"** que aparece hoje no fim da ficha. Os outros documentos (planilhas, apólice) vão para dentro das abas onde fazem sentido

### 3.4 A 5ª data: Confirmar emissão (~1 dia)
Algumas seguradoras (no protótipo, a Zurich) pedem que a MX confirme no dia seguinte ao corte que a fatura foi emitida.
- [ ] Campo **"Confirmar emissão"** (dia do mês) nas Regras do mês do cliente, **opcional** — em branco, a atividade não existe para aquele cliente
- [ ] Nova atividade no Controle, nos Alertas e nas vistas Mês e Semana, com o botão **Confirmar**
- [ ] Ao confirmar: registra quem e quando, vira evento na linha do tempo, e o alerta some
- [ ] Migration: `confirm_day` no cliente, `confirm_date` e `issue_confirmed_at` no mês, novo tipo de evento — com caso no teste de RLS

**Estimativa total:** ~2,5 dias, em quatro entregas que vão ao ar separadas.

## Preciso de você

1. **Quais seguradoras têm a confirmação de emissão?** Posso deixar o campo em branco para todos e a analista preenche, ou você me passa a lista e eu carrego.
2. **"Vidas" e "Prêmio" de meses passados**: aceita "—" nos meses anteriores (recomendo), ou quer que o sistema passe a guardar a foto do mês ao fechar? A foto é mais meio dia, e só vale daqui para frente.

## Aceite

A analista abre um cliente, vê as quatro abas, acha o boleto de agosto e baixa em dois cliques; e um cliente com confirmação de emissão aparece nos Alertas no dia seguinte ao corte até alguém clicar em **Confirmar**.

# Item 2 — Alertas de prazo (entregue em 06/10: decisões 1A e 2B)

**06/10/2026** · Referência: protótipo v0.7, tela `tAlertas` e o sino da barra.

## O que entrega

Uma tela `/alertas` que responde "o que está atrasado ou vence agora?", e um sino na barra do sistema com o número de pendências urgentes, visível em todas as telas.

## Como fica (fiel ao v0.7)

- **Sino na barra**: 🔔 com a contagem de **atrasados + hoje**. Clique abre `/alertas`.
- **Tela Alertas de prazo**, em quatro grupos:

| Grupo | O que entra |
|---|---|
| **Atrasados** | Atividade com prazo passado e ação não registrada: informar, corte, boleto, vencimento |
| **Hoje** | Atividade que vence hoje |
| **Próximos 3 dias** | Só **corte** e **vencimento**, como no protótipo |
| **Para validar** | Mês com planilha recebida aguardando conferência, e **gestor que reenviou depois da conferência** |

- Cada linha: o quê + cliente, depois "era 10/09 · Seguradora", e o botão da ação ("Enviar link", "Conferir", "Anexar boleto", "Marcar pago") que leva direto à tela certa.
- **Somem sozinhos** quando a ação é registrada: os alertas são calculados a partir do mês, não guardados. Nada para "marcar como lido" nem para ficar desatualizado.

## Como se constrói

Quase tudo já existe. `lib/dominio/atividade.ts` já calcula as 4 atividades de cada mês e o estado delas (feita, pendente, atrasada), e alimenta hoje as vistas Mês e Semana. Os alertas são a mesma lista **agrupada por urgência**.

| # | Entrega |
|---|---|
| 2.1 | `agruparAlertas(atividades, meses, hoje)`: função pura, testada, com "hoje" por parâmetro |
| 2.2 | Tela `/alertas` com os quatro grupos e os botões de ação |
| 2.3 | Sino na barra, com a contagem (uma consulta leve por página) |
| 2.4 | Rota nova em `ROTAS_PROTEGIDAS` e no teste de fumaça |

**Estimativa:** ~1 dia. Sem migration.

## Preciso de duas decisões suas

**1. Filtro "Analista"** — o protótipo filtra os alertas por analista, mas o sistema ainda não sabe quem cuida de cada cliente.

- **A)** Entregar agora **sem o filtro** (recomendo): a tela mostra tudo, e o filtro entra quando houver analista no cliente.
- **B)** Incluir já o **analista responsável no cadastro do cliente** (+1 dia). Aí preciso que você me diga quem cuida de quem — ou cada analista preenche aos poucos.

**2. Aviso diário à analista às 8h** — o protótipo diz "chegam por WhatsApp para a analista". Hoje o WhatsApp do sistema é um link que **alguém precisa clicar**; ele não sai sozinho.

- **A)** **Por e-mail**, pelo cron das 7h, com atrasados e os de hoje (recomendo). Depende do provedor de e-mail, que ainda está pendente com você.
- **B)** **Deixar para depois**: só a tela e o sino agora.
- **C)** WhatsApp automático exigiria contratar uma API paga de WhatsApp Business — fora do escopo atual.

## Aceite

A analista abre o sistema, vê o sino com o número, clica, e encontra cada prazo vencido com o botão que resolve. Registrada a ação, o alerta some.

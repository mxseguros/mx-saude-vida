-- ---------------------------------------------------------------------------
-- A linha do Controle passa a contar a coleta.
--
-- `create or replace view` nao aceita trocar o tipo nem a ordem das colunas
-- existentes, so acrescentar no fim. E o que fazemos: a definicao abaixo repete
-- a atual coluna por coluna — a de `acompanha_pagamento`, que ja tinha
-- acrescentado `invoice_installment`, `invoice_file_id` e `mx_tracks_payment` —
-- e as novas entram depois.
--
-- Repetir a lista inteira e o custo de view versionada em migration. A
-- alternativa, um `alter view`, nao existe para corpo de view no Postgres.
--
-- O QUE NAO ENTRA: `collection_token`. A analista pode le-lo — a RLS da tabela
-- permite —, mas esta view desenha 177 linhas no Controle, e por em cada linha
-- a credencial de acesso as vidas de uma empresa faria o token de todos os
-- clientes viajar ate o navegador a cada abertura da tela. A tela da coleta
-- busca o token do SEU mes, numa consulta de uma linha.
-- ---------------------------------------------------------------------------
create or replace view v_control_board
with (security_invoker = on) as
select
  mc.id,
  mc.client_id,
  mc.competence,
  mc.step,
  mc.inform_date,
  mc.cutoff_date,
  mc.invoice_date,
  mc.due_date,
  mc.protocol,
  mc.no_changes,
  mc.received_at,
  mc.checked_at,
  mc.invoice_amount,
  mc.invoice_due,
  mc.invoice_installment,
  mc.invoice_file_id,
  mc.paid_at,
  mc.analyst_id,
  c.legal_name,
  c.trade_name,
  c.document,
  c.product,
  c.channel,
  c.manager_name,
  c.manager_phone,
  c.manager_email,
  c.notes,
  c.mx_tracks_payment,
  i.name as insurer_name,
  p.full_name as analyst_name,
  m.kind as last_message_kind,
  m.channel as last_message_channel,
  m.sent_at as last_message_at,

  -- A coleta deste mes.
  (mc.collection_token is not null) as has_collection_link,
  mc.collection_expires_at,
  mc.collection_opened_at,

  -- O contato DO MES, que e diferente do contato do cadastro: quem informa
  -- pode mudar de um mes para o outro, e as duas respostas interessam — a do
  -- cadastro para saber a quem mandar, a do mes para saber quem respondeu.
  mc.manager_name   as month_manager_name,
  mc.manager_phone  as month_manager_phone,
  mc.manager_sector as month_manager_sector,

  -- Quem o gestor informou, e quem a MX digitou. Separados porque a
  -- conferencia trata diferente: so o que o GESTOR disse se cruza com a
  -- planilha dele.
  coalesce(mv.manager_entries, 0) as manager_entries,
  coalesce(mv.manager_exits, 0)   as manager_exits,
  coalesce(mv.staff_entries, 0)   as staff_entries,
  coalesce(mv.staff_exits, 0)     as staff_exits,

  /**
   * O ALERTA da decisao de 05/10: o gestor pode corrigir depois de enviar, e a
   * analista tem de saber.
   *
   * Derivado, e nao uma coluna: a resposta ja esta na linha do tempo, que e
   * append-only. Uma coluna `resent_after_check` seria um segundo lugar
   * guardando o mesmo fato, e os dois discordariam no primeiro `update` que
   * alguem esquecesse.
   */
  (mc.checked_at is not null and exists (
    select 1 from control_events e
     where e.control_id = mc.id
       and e.type in ('spreadsheet_received', 'no_changes')
       and e.origin = 'client'
       and e.created_at > mc.checked_at
  )) as resent_after_check
from monthly_controls mc
join clients c on c.id = mc.client_id
left join insurers i on i.id = c.insurer_id
left join profiles p on p.id = mc.analyst_id
left join messages m on m.id = mc.last_message_id
-- Agregado numa passada, e nao quatro subconsultas: o Controle desenha 177
-- linhas, e quatro `select count(*)` por linha sao 708 idas ao indice.
left join (
  select
    control_id,
    count(*) filter (where kind = 'entry' and source = 'manager') as manager_entries,
    count(*) filter (where kind = 'exit'  and source = 'manager') as manager_exits,
    count(*) filter (where kind = 'entry' and source = 'staff')   as staff_entries,
    count(*) filter (where kind = 'exit'  and source = 'staff')   as staff_exits
  from movements
  group by control_id
) mv on mv.control_id = mc.id
where c.deleted_at is null;

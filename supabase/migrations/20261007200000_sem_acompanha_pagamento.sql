-- A MX acompanha o pagamento de TODO cliente (07/10).
--
-- A opção "A MX acompanha o pagamento" saiu: mesmo quem faz a própria
-- movimentação precisa ter o pagamento confirmado. O código já não lê a
-- coluna; aqui ela sai do banco.
--
-- Meses que fecharam no boleto por causa da opção (concluídos com boleto
-- anexado e sem pagamento) voltam para "boleto", para o pagamento ser
-- confirmado. A rotina leva ao vencimento perto da data. Cada um ganha evento.

with alvo as (
  select id
    from monthly_controls
   where step = 'done'
     and paid_at is null
     and invoice_attached_at is not null
),
evento as (
  insert into control_events (control_id, type, origin, from_step, to_step, note)
  select id, 'step_changed', 'system', 'done', 'invoice',
         'Reaberto: a MX passa a confirmar o pagamento de todos os clientes.'
    from alvo
  returning control_id
)
update monthly_controls m
   set step = 'invoice'
  from alvo
 where m.id = alvo.id;

-- A view depende da coluna: sai e volta sem ela.
drop view v_control_board;

create view v_control_board
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
  i.name as insurer_name,
  p.full_name as analyst_name,
  m.kind as last_message_kind,
  m.channel as last_message_channel,
  m.sent_at as last_message_at,
  (mc.collection_token is not null) as has_collection_link,
  mc.collection_expires_at,
  mc.collection_opened_at,
  mc.manager_name   as month_manager_name,
  mc.manager_phone  as month_manager_phone,
  mc.manager_sector as month_manager_sector,
  coalesce(mv.manager_entries, 0) as manager_entries,
  coalesce(mv.manager_exits, 0)   as manager_exits,
  coalesce(mv.staff_entries, 0)   as staff_entries,
  coalesce(mv.staff_exits, 0)     as staff_exits,
  (mc.checked_at is not null and exists (
    select 1 from control_events e
     where e.control_id = mc.id
       and e.type in ('spreadsheet_received', 'no_changes')
       and e.origin = 'client'
       and e.created_at > mc.checked_at
  )) as resent_after_check,
  mc.confirm_date,
  mc.issue_confirmed_at,
  c.self_managed
from monthly_controls mc
join clients c on c.id = mc.client_id
left join insurers i on i.id = c.insurer_id
left join profiles p on p.id = mc.analyst_id
left join messages m on m.id = mc.last_message_id
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

alter table clients drop column mx_tracks_payment;

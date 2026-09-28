-- MX SaudeVida — visoes de leitura
--
-- `security_invoker = on` SEMPRE: sem isso a view roda com os privilegios de
-- quem a criou e ignora a RLS das tabelas de baixo — o cliente do portal veria
-- a linha de todos os outros.

-- A linha do Controle mensal, pronta para a tela.
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
  m.sent_at as last_message_at
from monthly_controls mc
join clients c on c.id = mc.client_id
left join insurers i on i.id = c.insurer_id
left join profiles p on p.id = mc.analyst_id
left join messages m on m.id = mc.last_message_id
where c.deleted_at is null;

-- O acervo do cliente: o que ele enviou e o que a MX disponibilizou.
create view v_client_documents
with (security_invoker = on) as
select
  f.id,
  f.client_id,
  f.control_id,
  f.kind,
  f.original_name,
  f.size_bytes,
  f.mime,
  f.created_at,
  mc.competence,
  mc.protocol,
  mc.step,
  mc.invoice_amount,
  mc.invoice_due,
  mc.paid_at,
  mc.correction_requested_at
from client_files f
left join monthly_controls mc on mc.id = f.control_id
where f.deleted_at is null;

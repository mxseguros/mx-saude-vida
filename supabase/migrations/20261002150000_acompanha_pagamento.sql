-- MX SaudeVida — a MX acompanha o pagamento deste cliente?
--
-- No CONTROLE FATURAS, 39 linhas vinham com a coluna VENCT preenchida com `-`,
-- `D/C` ou `BOLETO` em vez de um dia. Elas nao sao dado faltando: sao os
-- clientes em que a SEGURADORA COBRA DIRETO. A MX nao acompanha aquele
-- pagamento, e por isso nao ha vencimento a controlar.
--
-- Na importacao de 02/10 essas linhas entraram com um dia SUPOSTO, marcadas na
-- observacao com `[IMPORTACAO]`. Data suposta num sistema que manda mensagem e
-- uma cobranca no dia errado esperando a hora: este campo e o conserto.
--
-- Quando `false`:
--   · o mes FECHA ao anexar o boleto, em vez de esperar um vencimento que
--     ninguem vai conferir;
--   · a mensagem de vencimento nao sai;
--   · `due_day` continua preenchido porque a coluna e obrigatoria, mas deixa de
--     significar algo — e a tela diz isso.
--
-- O padrao e `true`: a maioria dos clientes do controle e acompanhada, e um
-- campo novo nao pode mudar o comportamento de quem ja estava certo.

alter table clients
  add column if not exists mx_tracks_payment boolean not null default true;

comment on column clients.mx_tracks_payment is
  'false = a seguradora cobra direto. O mes fecha no boleto e a mensagem de vencimento nao sai.';

-- ---------------------------------------------------------------------------
-- Os clientes que a importacao marcou com data suposta sao exatamente estes.
-- ---------------------------------------------------------------------------
update clients
   set mx_tracks_payment = false
 where notes like '%[IMPORTACAO] vencimento suposto%'
   and mx_tracks_payment;

-- A marca na observacao cumpriu o papel: ela existia para ninguem esquecer de
-- conferir, e a conferencia virou coluna. Fica so o resto da observacao
-- original, quando havia.
update clients
   set notes = nullif(
         btrim(regexp_replace(notes, '\[IMPORTACAO\][^·]*(·\s*)?', '', 'g')),
         ''
       )
 where notes like '%[IMPORTACAO]%';

-- ---------------------------------------------------------------------------
-- A view do Controle precisa levar o campo: a tela e o cron decidem com ele.
-- `create or replace` mantem as politicas; `security_invoker` segue valendo.
-- ---------------------------------------------------------------------------
drop view if exists v_control_board;

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
  c.mx_tracks_payment,
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

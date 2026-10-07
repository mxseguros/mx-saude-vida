-- Meses fechados sem boleto (07/10).
--
-- Cliente sem movimentacao de vidas comecava o mes no passo `invoice`
-- ("boleto anexado") em vez de esperar o boleto. Se a MX nao acompanha o
-- pagamento, a rotina das 7h fechava o mes como concluido no mesmo dia, sem
-- boleto nenhum. O codigo foi corrigido; aqui voltam os meses afetados.
--
-- Criterio: passo invoice, due ou done SEM boleto anexado e SEM pagamento —
-- esses passos so existem depois do boleto. Voltam para `cutoff`, onde o mes
-- espera o boleto. Cada um ganha um evento na linha do tempo (regra 4).

with alvo as (
  select id, step
    from monthly_controls
   where step in ('invoice', 'due', 'done')
     and invoice_attached_at is null
     and paid_at is null
),
evento as (
  insert into control_events (control_id, type, origin, from_step, to_step, note)
  select id, 'step_changed', 'system', step, 'cutoff',
         'Correção: o mês estava adiantado sem boleto anexado. Voltou para aguardar o boleto.'
    from alvo
  returning control_id
)
update monthly_controls m
   set step = 'cutoff'
  from alvo
 where m.id = alvo.id;

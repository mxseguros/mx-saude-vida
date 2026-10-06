-- O registro da IA passa a funcionar DENTRO do app.
--
-- `lib/ia/registro.ts` veio do MX Sinistro e nunca foi adaptado: gravava
-- colunas que nao existem aqui e chamava `gasto_ia_do_dia`, que nao existia.
-- Toda gravacao falhava em silencio (o registro nunca lanca), o cache nunca
-- achava nada e o teto diario respondia "esgotado" sempre. O agente da apolice
-- so tinha sido provado por script.

alter table ai_runs add column if not exists input_summary text;

-- A equipe que ESCREVE registra a propria execucao. Assinar por outra pessoa
-- burlaria o teto diario, que e por pessoa.
create policy ai_runs_insert on ai_runs
  for insert to authenticated
  with check (can_write() and profile_id = auth.uid());

-- So o aceite muda depois: a saida do modelo e o custo sao livro-caixa.
create policy ai_runs_update on ai_runs
  for update to authenticated
  using (can_write())
  with check (can_write());

revoke update on ai_runs from authenticated;
grant update (accepted) on ai_runs to authenticated;

-- Quanto a pessoa gastou HOJE, no dia de Sao Paulo. Leitura: roda como quem
-- chama, e a RLS de ai_runs ja limita a equipe ativa.
create or replace function gasto_ia_do_dia(pessoa uuid)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(sum(cost_brl), 0)
    from ai_runs
   where profile_id = pessoa
     and (created_at at time zone 'America/Sao_Paulo')::date = local_today();
$$;

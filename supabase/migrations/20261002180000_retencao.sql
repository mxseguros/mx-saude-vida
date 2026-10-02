-- MX SaudeVida — retencao de dado pessoal (LGPD)
--
-- A planilha de vidas tem nome, CPF e data de nascimento de cada funcionario do
-- cliente. O boleto tem o CNPJ e o endereco. Guardar isso para sempre nao e
-- cuidado, e risco: dado que nao precisa mais existir e dado que pode vazar.
--
-- O art. 16 da LGPD manda eliminar depois de cumprida a finalidade. A finalidade
-- aqui e operar o seguro do mes, e ela termina quando o mes fecha — mas a MX
-- precisa poder provar o que movimentou, entao o prazo nao e curto.
--
-- O QUE ESTE ARQUIVO FAZ E O QUE NAO FAZ:
--   · Marca `deleted_at` nas fichas de arquivo vencidas. O objeto no Storage
--     NAO sai daqui: apagar no bucket e chamada de API, nao SQL, e quem faz e o
--     cron (`/api/cron/mensal`) depois de ler esta lista.
--   · NAO toca em `control_events` nem em `messages`. Eles sao append-only e
--     contam o que a MX fez — sem eles nao ha como responder "voces me
--     avisaram?" dois anos depois. Eles nao guardam CPF.
--   · NAO apaga `monthly_controls`: valor, vencimento e protocolo sao registro
--     contabil, e nao dado pessoal de funcionario.

-- `client_files` so tinha `deleted_at`. Sem o motivo, "removido" nao distingue
-- retencao cumprida de arquivo apagado por engano — e e justamente essa a
-- pergunta que aparece quando alguem procura um documento que nao esta mais la.
alter table client_files
  add column if not exists deleted_reason text;

-- ---------------------------------------------------------------------------
-- Os prazos, numa tabela e nao no codigo.
--
-- Em tabela porque prazo de retencao e decisao de negocio: muda com orientacao
-- juridica, e trocar um numero nao deveria exigir deploy.
-- ---------------------------------------------------------------------------
create table if not exists retention_rules (
  kind file_kind primary key,
  months int not null check (months between 1 and 240),
  reason text not null,
  updated_at timestamptz not null default now()
);

insert into retention_rules (kind, months, reason) values
  (
    'spreadsheet', 24,
    'Relacao de vidas: nome, CPF e nascimento de cada funcionario. Dois anos cobrem a conferencia de movimentacao retroativa que a seguradora pede.'
  ),
  (
    'invoice', 60,
    'Boleto: documento de pagamento. Cinco anos acompanham o prazo de guarda fiscal.'
  ),
  (
    'policy', 60,
    'Apolice: vale pelo contrato e por anos depois dele, para discussao de cobertura.'
  )
on conflict (kind) do nothing;

alter table retention_rules enable row level security;

create policy retention_rules_select on retention_rules
  for select to authenticated
  using (is_active_member());

create policy retention_rules_write_admin on retention_rules
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- ---------------------------------------------------------------------------
-- O que esta vencido.
--
-- View e nao funcao: o cron precisa LER a lista para apagar os objetos no
-- Storage antes de marcar as fichas. Uma funcao que marcasse tudo de uma vez
-- deixaria o bucket cheio de arquivo invisivel.
-- ---------------------------------------------------------------------------
create or replace view v_files_to_purge
with (security_invoker = on) as
select
  f.id,
  f.client_id,
  f.kind,
  f.storage_path,
  f.created_at,
  r.months,
  (f.created_at + make_interval(months => r.months))::date as vence_em
from client_files f
join retention_rules r on r.kind = f.kind
where f.deleted_at is null
  and f.created_at + make_interval(months => r.months) < now();

comment on view v_files_to_purge is
  'Arquivos cuja retencao venceu. O cron apaga o objeto no Storage e so depois marca deleted_at.';

-- ---------------------------------------------------------------------------
-- Marcar como removido. `security definer` porque o cron roda sem sessao de
-- gente, e `revoke` de anon/authenticated porque ninguem deve chamar isto da
-- interface.
-- ---------------------------------------------------------------------------
create or replace function marcar_arquivo_removido(p_arquivo uuid, p_motivo text default 'retencao')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_afetadas int;
begin
  update client_files
     set deleted_at = now(),
         deleted_reason = p_motivo
   where id = p_arquivo
     and deleted_at is null;

  get diagnostics v_afetadas = row_count;
  return v_afetadas > 0;
end;
$$;

revoke all on function marcar_arquivo_removido(uuid, text) from public, anon, authenticated;
grant execute on function marcar_arquivo_removido(uuid, text) to service_role;

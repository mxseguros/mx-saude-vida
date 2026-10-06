-- Funcionarios: a base de vidas de cada cliente (protótipo v0.7, tFunc).
--
-- E a tabela com mais dado pessoal do sistema — CPF, nascimento e salario de
-- cada pessoa — e entra com RLS e retencao desde o primeiro dia.
--
-- Uma linha por VINCULO, nao por pessoa: demitir fecha a linha
-- (`dismissed_at`) e readmitir abre outra com o mesmo CPF. Assim o historico
-- de quem saiu e voltou fica inteiro, e "ativo" e uma pergunta so: sem data de
-- saida.

create table employees (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) > 0),
  -- CPF, so digitos. Anulavel: planilha de cliente as vezes vem sem.
  document text check (document is null or document ~ '^[0-9]{11}$'),
  birth_date date check (birth_date is null or birth_date > date '1900-01-01'),
  job_title text check (job_title is null or length(btrim(job_title)) between 1 and 80),
  salary numeric(12, 2) check (salary is null or salary >= 0),
  -- Texto por enquanto; Configuracoes > Setores e gestores vira lista depois.
  sector text check (sector is null or length(btrim(sector)) between 1 and 80),
  manager_name text check (manager_name is null or length(btrim(manager_name)) between 1 and 120),
  hired_at date,
  dismissed_at date,
  dismissal_reason text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employees_saida_depois_da_entrada
    check (dismissed_at is null or hired_at is null or dismissed_at >= hired_at)
);

-- O mesmo CPF ativo duas vezes no mesmo cliente e a mesma vida cobrada em
-- dobro. Demitido pode repetir: e o historico.
create unique index employees_cpf_ativo
  on employees (client_id, document)
  where document is not null and dismissed_at is null;

create index employees_client_idx on employees (client_id, dismissed_at);

create trigger employees_updated_at
  before update on employees
  for each row execute function set_updated_at();

alter table employees enable row level security;

create policy employees_select on employees
  for select to authenticated
  using (is_active_member());

create policy employees_insert on employees
  for insert to authenticated
  with check (can_write());

create policy employees_update on employees
  for update to authenticated
  using (can_write())
  with check (can_write());

-- Remover e demitir. Excluir de vez so para cadastro feito por engano.
create policy employees_delete_admin on employees
  for delete to authenticated
  using (is_admin());

-- Retencao: quem saiu ha mais tempo que o prazo da planilha e apagado. O prazo
-- vem de retention_rules, o mesmo da relacao de vidas de onde o dado veio.
create or replace function limpar_funcionarios_vencidos()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meses int;
  v_apagadas int;
begin
  select months into v_meses from retention_rules where kind = 'spreadsheet';
  if v_meses is null then
    raise exception 'retention_rules nao tem prazo para spreadsheet';
  end if;

  delete from employees
   where dismissed_at is not null
     and dismissed_at + make_interval(months => v_meses) < current_date;

  get diagnostics v_apagadas = row_count;
  return v_apagadas;
end;
$$;

revoke all on function limpar_funcionarios_vencidos() from public, anon, authenticated;
grant execute on function limpar_funcionarios_vencidos() to service_role;

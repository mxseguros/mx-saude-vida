-- MX SaudeVida — Row Level Security
--
-- Dois publicos, e nenhum deles e anonimo:
--
--   EQUIPE   linha em `profiles`, ativa e sem bloqueio. Le tudo; `analyst` e
--            `admin` escrevem; `reader` so le; Configuracoes e do `admin`.
--   CLIENTE  linha em `client_users`, ativa. Enxerga SO o proprio `client_id`:
--            o cadastro, os controles, os arquivos e as mensagens dele.
--
-- Nao existe NENHUMA politica para o papel `anon`, e a ausencia e intencional.
--
-- Politica nao testada e politica que nao existe: ver supabase/tests/rls.sql,
-- que prova a NEGATIVA.

-- ---------------------------------------------------------------------------
-- Helpers.
--
-- `security definer` nao e enfeite: consultar profiles de dentro de uma
-- politica DE profiles dispara "infinite recursion detected in policy".
-- ---------------------------------------------------------------------------
create or replace function is_active_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active and locked_at is null
  );
$$;

-- Quem altera: analista e administrador. O perfil de leitura fica de fora.
create or replace function can_write()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active and locked_at is null and role in ('analyst', 'admin')
  );
$$;

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active and locked_at is null and role = 'admin'
  );
$$;

create or replace function current_user_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- O cliente de quem entrou pelo portal; nulo para todo o resto. Cliente
-- inativado perde o portal na hora, junto com o usuario desativado.
create or replace function client_id_of_user()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select cu.client_id
    from public.client_users cu
    join public.clients c on c.id = cu.client_id
   where cu.id = auth.uid()
     and cu.active
     and c.active
     and c.deleted_at is null;
$$;

-- ---------------------------------------------------------------------------
alter table profiles          enable row level security;
alter table insurers          enable row level security;
alter table clients           enable row level security;
alter table policies          enable row level security;
alter table client_users      enable row level security;
alter table client_files      enable row level security;
alter table monthly_controls  enable row level security;
alter table control_events    enable row level security;
alter table message_templates enable row level security;
alter table messages          enable row level security;
alter table ai_prompts        enable row level security;
alter table ai_runs           enable row level security;
alter table cron_runs         enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy profiles_select on profiles
  for select to authenticated
  using (is_active_member());

-- Cada pessoa edita o proprio nome. Papel e ativacao NAO: uma analista nao se
-- promove a admin sozinha, e ninguem se desliga por engano.
create policy profiles_update_self on profiles
  for update to authenticated
  using (id = auth.uid() and is_active_member())
  with check (id = auth.uid() and role = current_user_role() and active);

create policy profiles_update_admin on profiles
  for update to authenticated
  using (is_admin())
  with check (is_admin());

create policy profiles_insert_admin on profiles
  for insert to authenticated
  with check (is_admin());

-- ---------------------------------------------------------------------------
-- Seguradoras
-- ---------------------------------------------------------------------------
create policy insurers_select on insurers
  for select to authenticated
  using (is_active_member());

create policy insurers_write_admin on insurers
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- ---------------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------------
create policy clients_select_staff on clients
  for select to authenticated
  using (is_active_member());

-- O cliente ve o proprio cadastro — e so ele.
create policy clients_select_own on clients
  for select to authenticated
  using (id = client_id_of_user());

create policy clients_insert on clients
  for insert to authenticated
  with check (can_write());

create policy clients_update on clients
  for update to authenticated
  using (can_write())
  with check (can_write());

-- Excluir de vez e so para cadastro criado por engano.
create policy clients_delete_admin on clients
  for delete to authenticated
  using (is_admin());

-- ---------------------------------------------------------------------------
-- Apolices
-- ---------------------------------------------------------------------------
create policy policies_select_staff on policies
  for select to authenticated
  using (is_active_member());

create policy policies_select_own on policies
  for select to authenticated
  using (client_id = client_id_of_user());

create policy policies_write on policies
  for all to authenticated
  using (can_write())
  with check (can_write());

-- ---------------------------------------------------------------------------
-- Usuarios do portal
-- ---------------------------------------------------------------------------
create policy client_users_select_staff on client_users
  for select to authenticated
  using (is_active_member());

create policy client_users_select_self on client_users
  for select to authenticated
  using (id = auth.uid());

create policy client_users_write on client_users
  for all to authenticated
  using (can_write())
  with check (can_write());

-- ---------------------------------------------------------------------------
-- Arquivos
-- ---------------------------------------------------------------------------
create policy client_files_select_staff on client_files
  for select to authenticated
  using (is_active_member() and deleted_at is null);

create policy client_files_select_own on client_files
  for select to authenticated
  using (client_id = client_id_of_user() and deleted_at is null);

create policy client_files_insert_staff on client_files
  for insert to authenticated
  with check (can_write() and uploaded_by_profile = auth.uid());

-- O cliente so envia PLANILHA, em nome proprio, para o proprio cadastro.
create policy client_files_insert_own on client_files
  for insert to authenticated
  with check (
    client_id = client_id_of_user()
    and kind = 'spreadsheet'
    and uploaded_by_client_user = auth.uid()
    and uploaded_by_profile is null
  );

create policy client_files_update_staff on client_files
  for update to authenticated
  using (can_write())
  with check (can_write());

-- ---------------------------------------------------------------------------
-- Controle mensal
--
-- O cliente LE o proprio controle. Quem muda o passo e sempre o servidor, com
-- a chave de administracao, depois de conferir a transicao em
-- lib/dominio/controle.ts: nao ha politica de escrita para o cliente.
-- ---------------------------------------------------------------------------
create policy monthly_controls_select_staff on monthly_controls
  for select to authenticated
  using (is_active_member());

create policy monthly_controls_select_own on monthly_controls
  for select to authenticated
  using (client_id = client_id_of_user());

create policy monthly_controls_insert on monthly_controls
  for insert to authenticated
  with check (can_write());

create policy monthly_controls_update on monthly_controls
  for update to authenticated
  using (can_write())
  with check (can_write());

-- ---------------------------------------------------------------------------
-- Eventos — append-only. Sem politica de update nem de delete, de proposito.
-- O cliente nao le a linha do tempo: ela tem observacao interna da equipe.
-- ---------------------------------------------------------------------------
create policy control_events_select on control_events
  for select to authenticated
  using (is_active_member());

create policy control_events_insert on control_events
  for insert to authenticated
  with check (can_write() and actor_profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Mensagens
-- ---------------------------------------------------------------------------
create policy message_templates_select on message_templates
  for select to authenticated
  using (is_active_member());

create policy message_templates_write_admin on message_templates
  for all to authenticated
  using (is_admin())
  with check (is_admin());

create policy messages_select_staff on messages
  for select to authenticated
  using (is_active_member());

-- O cliente ve o que foi enviado a ele.
create policy messages_select_own on messages
  for select to authenticated
  using (
    exists (
      select 1 from monthly_controls mc
      where mc.id = messages.control_id and mc.client_id = client_id_of_user()
    )
  );

create policy messages_insert on messages
  for insert to authenticated
  with check (can_write());

-- O status muda de `pending` para `sent` quando a analista abre o WhatsApp.
create policy messages_update on messages
  for update to authenticated
  using (can_write())
  with check (can_write());

-- ---------------------------------------------------------------------------
-- IA
-- ---------------------------------------------------------------------------
create policy ai_prompts_select on ai_prompts
  for select to authenticated
  using (is_active_member());

create policy ai_prompts_write_admin on ai_prompts
  for all to authenticated
  using (is_admin())
  with check (is_admin());

create policy ai_runs_select on ai_runs
  for select to authenticated
  using (is_active_member());

create policy ai_runs_insert on ai_runs
  for insert to authenticated
  with check (can_write() and profile_id = auth.uid());

create policy ai_runs_update on ai_runs
  for update to authenticated
  using (can_write())
  with check (can_write());

-- ---------------------------------------------------------------------------
-- Cron: so o servidor escreve (chave de administracao ignora a RLS). A equipe
-- le, para saber se o dia rodou.
-- ---------------------------------------------------------------------------
create policy cron_runs_select on cron_runs
  for select to authenticated
  using (is_active_member());

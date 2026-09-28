-- MX SaudeVida — base inicial
-- Referencia: documentacao/plano-de-desenvolvimento.md, secao 3.
-- Convencao: banco e API em ingles; interface em portugues. A traducao
-- acontece so em apps/web/lib/dominio/mapear.ts.

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists citext;     -- e-mail sem distincao de caixa

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
-- Equipe da MX. `reader` consulta e baixa; nao altera nada.
create type user_role as enum ('analyst', 'reader', 'admin');

-- As colunas TIPO do controle de faturas.
create type product_type as enum ('health', 'life', 'dental', 'global', 'transport', 'group_life');

-- Por onde o cliente recebe as mensagens do mes.
create type notify_channel as enum ('whatsapp', 'email', 'both');

-- O passo do mes. A ordem do enum E a ordem em que o mes anda.
create type control_step as enum (
  'inform', 'spreadsheet_received', 'checked', 'cutoff', 'invoice', 'due', 'done'
);

create type message_kind as enum ('inform', 'cutoff', 'invoice', 'due', 'correction');
create type message_channel as enum ('email', 'whatsapp');
create type message_status as enum ('pending', 'sent', 'failed');

create type file_kind as enum ('spreadsheet', 'invoice', 'policy');

create type control_event_type as enum (
  'opened', 'step_changed', 'spreadsheet_received', 'no_changes', 'checked',
  'correction_requested', 'invoice_attached', 'paid', 'message', 'note', 'system'
);

-- Quem produziu o evento. Muda o selo na linha do tempo, nunca o conteudo.
create type event_origin as enum ('staff', 'client', 'ai', 'system');

-- ---------------------------------------------------------------------------
-- Utilitarios
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Dia corrente em Sao Paulo. O prazo e calculado contra ISTO, nao contra UTC:
-- uma data que vence hoje as 23h ja seria "amanha" em UTC.
create or replace function local_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- ---------------------------------------------------------------------------
-- Equipe
--
-- NAO ha gatilho que cria perfil no primeiro login: quem entra por `auth.users`
-- pode ser da equipe OU cliente do portal, e um gatilho generico transformaria
-- todo cliente em analista. O perfil nasce de forma explicita, em Configuracoes
-- (equipe) ou no cadastro do cliente (portal).
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  initials text generated always as (
    upper(
      left(split_part(full_name, ' ', 1), 1) ||
      left(split_part(full_name, ' ', 2), 1)
    )
  ) stored,
  role user_role not null default 'analyst',
  active boolean not null default true,
  phone text,
  -- Senhas erradas seguidas. So o servidor escreve (ver a migration de login).
  failed_logins int not null default 0,
  locked_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table profiles is
  'Equipe da MX. Desativar tira o acesso na hora. Cliente do portal NAO tem linha aqui.';

-- ---------------------------------------------------------------------------
-- Seguradoras — lista editavel, nunca constante no codigo.
-- ---------------------------------------------------------------------------
create table insurers (
  id bigserial primary key,
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Clientes (segurados)
--
-- As colunas seguem o controle de faturas: segurado, CNPJ, cia, tipo, corte,
-- vencimento, e-mail, observacoes. As quatro datas das Regras do mes sao DIA
-- DO MES (1 a 31); a data de cada competencia e calculada e congelada em
-- `monthly_controls`.
-- ---------------------------------------------------------------------------
create table clients (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  trade_name text,
  -- So digitos: 14 (CNPJ) ou 11 (CPF, para o segurado pessoa fisica).
  document text not null unique check (document ~ '^[0-9]{11}$|^[0-9]{14}$'),
  insurer_id bigint references insurers(id),
  product product_type not null default 'life',
  notes text,

  -- Regras do mes. `inform_day` e `cutoff_day` nulos = apolice sem
  -- movimentacao: o mes comeca direto no boleto.
  inform_day int check (inform_day between 1 and 31),
  cutoff_day int check (cutoff_day between 1 and 31),
  invoice_day int not null check (invoice_day between 1 and 31),
  due_day int not null check (due_day between 1 and 31),

  -- Canal de aviso.
  channel notify_channel not null default 'whatsapp',
  manager_name text,
  manager_phone text,
  manager_email citext,

  active boolean not null default true,
  -- Inativar nao apaga: o historico de movimentacoes, documentos e boletos fica.
  deleted_at timestamptz,
  deleted_reason text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Quem tem data de informar tem data de corte, e vice-versa.
  constraint clients_movimentacao_inteira check ((inform_day is null) = (cutoff_day is null))
);

create trigger clients_updated_at
  before update on clients
  for each row execute function set_updated_at();

create index clients_name_idx on clients (lower(coalesce(trade_name, legal_name)));
create index clients_insurer_idx on clients (insurer_id);

-- ---------------------------------------------------------------------------
-- Arquivos do cliente: planilha do mes, boleto e apolice.
--
-- O conteudo mora no Storage (bucket privado `client-files`); aqui fica a
-- ficha. Caminho: <client_id>/<competencia ou "apolice">/<uuid>-<nome>.
-- ---------------------------------------------------------------------------
create table client_files (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  -- Preenchido depois da criacao do controle; a apolice nao tem.
  control_id uuid,
  kind file_kind not null,
  storage_path text not null unique,
  original_name text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  mime text not null,
  -- Um dos dois: a equipe ou o cliente do portal.
  uploaded_by_profile uuid references profiles(id),
  uploaded_by_client_user uuid,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index client_files_client_idx on client_files (client_id, created_at desc);
create index client_files_control_idx on client_files (control_id);

-- ---------------------------------------------------------------------------
-- IA — so a leitura do PDF da apolice usa modelo.
-- ---------------------------------------------------------------------------
create table ai_prompts (
  id bigserial primary key,
  agent text not null,
  version int not null,
  body text not null,
  active boolean not null default false,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (agent, version)
);

-- No maximo um prompt ativo por agente.
create unique index ai_prompts_um_ativo on ai_prompts (agent) where active;

create table ai_runs (
  id bigserial primary key,
  agent text not null,
  prompt_id bigint references ai_prompts(id),
  client_id uuid references clients(id) on delete set null,
  profile_id uuid references profiles(id),
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_brl numeric(10, 4) not null default 0,
  -- sha256 do conteudo lido: a mesma apolice nao e paga duas vezes.
  content_hash text,
  output jsonb,
  accepted boolean,
  error text,
  created_at timestamptz not null default now()
);

create index ai_runs_dia_idx on ai_runs (profile_id, created_at);
create index ai_runs_hash_idx on ai_runs (agent, content_hash);

-- ---------------------------------------------------------------------------
-- Apolice
-- ---------------------------------------------------------------------------
create table policies (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  policy_number text not null,
  contract_number text,
  product_name text,
  valid_from date,
  valid_to date,
  -- {"tipo":"por_cargo","faixas":[{"rotulo":"Funcionario","capital":23103.62}]}
  -- ou {"tipo":"per_capita","valor":18.91}.
  capital_rule jsonb not null default '{}'::jsonb,
  rate_per_mille numeric(12, 6),
  age_limit int,
  pdf_file_id uuid references client_files(id) on delete set null,
  extracted_by_ai_run bigint references ai_runs(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint policies_vigencia check (valid_to is null or valid_from is null or valid_to >= valid_from)
);

create trigger policies_updated_at
  before update on policies
  for each row execute function set_updated_at();

create index policies_client_idx on policies (client_id);

-- ---------------------------------------------------------------------------
-- Portal do cliente
-- ---------------------------------------------------------------------------
create table client_users (
  id uuid primary key references auth.users(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  full_name text not null,
  phone text,
  active boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

comment on table client_users is
  'Quem entra no portal em nome de um cliente. So enxerga o proprio client_id.';

create index client_users_client_idx on client_users (client_id);

alter table client_files
  add constraint client_files_client_user_fk
  foreign key (uploaded_by_client_user) references client_users(id) on delete set null;

alter table client_files
  add constraint client_files_um_autor
  check (uploaded_by_profile is null or uploaded_by_client_user is null);

-- ---------------------------------------------------------------------------
-- Controle mensal: uma linha por cliente por competencia.
-- ---------------------------------------------------------------------------
create table monthly_controls (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  -- Sempre o dia 1 do mes.
  competence date not null check (extract(day from competence) = 1),
  step control_step not null default 'inform',

  -- As datas do mes, congeladas na abertura: mudar a regra no cadastro nao
  -- reescreve um mes que ja esta em andamento.
  inform_date date,
  cutoff_date date,
  invoice_date date not null,
  due_date date not null,

  -- Planilha.
  spreadsheet_file_id uuid references client_files(id) on delete set null,
  received_at timestamptz,
  received_by_client_user uuid references client_users(id) on delete set null,
  received_by_profile uuid references profiles(id),
  received_note text,
  no_changes boolean not null default false,

  -- Conferencia.
  checked_at timestamptz,
  checked_by uuid references profiles(id),
  check_note text,
  correction_requested_at timestamptz,
  correction_reason text,

  -- Boleto.
  invoice_file_id uuid references client_files(id) on delete set null,
  invoice_amount numeric(12, 2),
  invoice_installment text,
  invoice_number text,
  invoice_due date,
  invoice_attached_at timestamptz,
  paid_at timestamptz,

  analyst_id uuid references profiles(id),
  protocol text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (client_id, competence)
);

create trigger monthly_controls_updated_at
  before update on monthly_controls
  for each row execute function set_updated_at();

create index monthly_controls_competence_idx on monthly_controls (competence, step);

alter table client_files
  add constraint client_files_control_fk
  foreign key (control_id) references monthly_controls(id) on delete set null;

-- Protocolo MOV-000123, gerado no banco.
create sequence control_protocol_seq;

create or replace function monthly_controls_protocolo()
returns trigger
language plpgsql
as $$
begin
  if new.protocol is null then
    new.protocol := 'MOV-' || lpad(nextval('control_protocol_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

create trigger monthly_controls_protocolo
  before insert on monthly_controls
  for each row execute function monthly_controls_protocolo();

-- ---------------------------------------------------------------------------
-- Eventos do controle — a linha do tempo. APPEND-ONLY: a RLS nao tem politica
-- de update nem de delete.
-- ---------------------------------------------------------------------------
create table control_events (
  id bigserial primary key,
  control_id uuid not null references monthly_controls(id) on delete cascade,
  type control_event_type not null,
  origin event_origin not null default 'staff',
  actor_profile_id uuid references profiles(id),
  actor_client_user_id uuid references client_users(id) on delete set null,
  from_step control_step,
  to_step control_step,
  note text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index control_events_control_idx on control_events (control_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Mensagens
-- ---------------------------------------------------------------------------
create table message_templates (
  kind message_kind primary key,
  default_channel notify_channel not null default 'whatsapp',
  -- So o e-mail tem assunto.
  subject text not null,
  body text not null,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);

create trigger message_templates_updated_at
  before update on message_templates
  for each row execute function set_updated_at();

create table messages (
  id bigserial primary key,
  control_id uuid not null references monthly_controls(id) on delete cascade,
  kind message_kind not null,
  channel message_channel not null,
  to_address text not null,
  body text not null,
  status message_status not null default 'pending',
  -- Nulo quando o cron enviou.
  sent_by uuid references profiles(id),
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create index messages_control_idx on messages (control_id, created_at desc);
-- Os WhatsApps que a analista precisa abrir hoje.
create index messages_pendentes_idx on messages (status, channel) where status = 'pending';

alter table monthly_controls
  add column last_message_id bigint references messages(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Cron — uma linha por dia rodado. A chave primaria e o que torna a rota
-- idempotente: a segunda chamada do mesmo dia nao envia de novo.
-- ---------------------------------------------------------------------------
create table cron_runs (
  run_date date primary key,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

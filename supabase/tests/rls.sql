-- MX SaudeVida — teste de RLS que prova a NEGATIVA
--
-- Politica escrita e nao testada e politica que nao existe.
--
-- Como rodar:
--   corepack pnpm teste:rls
-- ou direto:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql
--
-- Roda inteiro dentro de uma transacao e faz rollback: nao deixa lixo. Cada
-- verificacao levanta exception em vez de imprimir aviso, entao qualquer
-- falha aborta com codigo de saida diferente de zero e o CI fica vermelho.
--
-- Todos os dados abaixo sao SINTETICOS: documento iniciado em 999, dominio
-- exemplo.test.

\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- Fixtures. Criadas como superusuario, que ignora RLS de proposito: o teste
-- precisa de linhas EXISTINDO para provar que quem nao pode nao as ve.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', 'analista@exemplo.test', 'authenticated', 'authenticated', now(), now()),
  ('22222222-2222-2222-2222-222222222222', 'admin@exemplo.test',    'authenticated', 'authenticated', now(), now()),
  ('33333333-3333-3333-3333-333333333333', 'desligada@exemplo.test','authenticated', 'authenticated', now(), now()),
  ('44444444-4444-4444-4444-444444444444', 'leitura@exemplo.test',  'authenticated', 'authenticated', now(), now()),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'gestor.a@exemplo.test', 'authenticated', 'authenticated', now(), now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'gestor.b@exemplo.test', 'authenticated', 'authenticated', now(), now());

insert into profiles (id, full_name, role, active)
values
  ('11111111-1111-1111-1111-111111111111', 'Analista Teste',  'analyst', true),
  ('22222222-2222-2222-2222-222222222222', 'Admin Teste',     'admin',   true),
  ('33333333-3333-3333-3333-333333333333', 'Desligada Teste', 'analyst', false),
  ('44444444-4444-4444-4444-444444444444', 'Leitura Teste',   'reader',  true);

insert into clients (id, legal_name, trade_name, document, product, inform_day, cutoff_day, invoice_day, due_day)
values
  ('a0000000-0000-0000-0000-000000000001', 'Cliente A Ltda', 'Cliente A', '99999999000191', 'life', 8, 10, 16, 30),
  ('b0000000-0000-0000-0000-000000000002', 'Cliente B Ltda', 'Cliente B', '99999998000100', 'life', 20, 25, 26, 10);

insert into client_users (id, client_id, full_name)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a0000000-0000-0000-0000-000000000001', 'Gestor A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b0000000-0000-0000-0000-000000000002', 'Gestor B');

insert into monthly_controls (id, client_id, competence, step, inform_date, cutoff_date, invoice_date, due_date)
values
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001', date '2026-09-01', 'inform',
   date '2026-09-08', date '2026-09-10', date '2026-09-16', date '2026-09-30'),
  ('c0000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-000000000002', date '2026-09-01', 'inform',
   date '2026-09-20', date '2026-09-25', date '2026-09-26', date '2026-10-10');

insert into client_files (id, client_id, control_id, kind, storage_path, original_name, size_bytes, mime, uploaded_by_profile)
values
  ('f0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a',
   'spreadsheet', 'a0000000-0000-0000-0000-000000000001/2026-09/teste-a.xlsx', 'teste-a.xlsx', 10,
   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '11111111-1111-1111-1111-111111111111'),
  ('f0000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-00000000000b',
   'spreadsheet', 'b0000000-0000-0000-0000-000000000002/2026-09/teste-b.xlsx', 'teste-b.xlsx', 10,
   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '11111111-1111-1111-1111-111111111111');

insert into control_events (control_id, type, origin, actor_profile_id, to_step, note)
values ('c0000000-0000-0000-0000-00000000000a', 'opened', 'system', null, 'inform', 'Aberto no teste.');

insert into messages (control_id, kind, channel, to_address, body, status)
values
  ('c0000000-0000-0000-0000-00000000000a', 'inform', 'email', 'gestor.a@exemplo.test', 'Mensagem para A', 'sent'),
  ('c0000000-0000-0000-0000-00000000000b', 'inform', 'email', 'gestor.b@exemplo.test', 'Mensagem para B', 'sent');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function pg_temp.exigir(condicao boolean, mensagem text)
returns void language plpgsql as $$
begin
  if not condicao then
    raise exception 'FALHOU: %', mensagem;
  end if;
end;
$$;

/*
 * Exige que um comando seja RECUSADO, e diz por QUAL motivo.
 *
 * `estado` e o SQLSTATE esperado: 42501 e a recusa da RLS. Sem essa distincao
 * o teste aceitaria qualquer erro como sucesso, e um comando que falhasse por
 * digitacao errada passaria como se a regra o tivesse barrado.
 */
create or replace function pg_temp.exigir_recusa(
  comando text,
  mensagem text,
  estado text default '42501'
)
returns void language plpgsql as $$
begin
  execute comando;

  -- Codigo PROPRIO para este erro nunca ser confundido com a recusa esperada.
  raise exception 'FALHOU: % (o comando passou e deveria ter sido recusado)', mensagem
    using errcode = 'ZZ001';
exception
  when others then
    if sqlstate = estado then return; end if;
    raise;
end;
$$;

-- ===========================================================================
-- 1. Anonimo nao ve NADA
-- ===========================================================================
set local role anon;

select pg_temp.exigir((select count(*) from clients) = 0, 'anonimo enxergou clientes');
select pg_temp.exigir((select count(*) from profiles) = 0, 'anonimo enxergou a equipe');
select pg_temp.exigir((select count(*) from client_users) = 0, 'anonimo enxergou os usuarios do portal');
select pg_temp.exigir((select count(*) from monthly_controls) = 0, 'anonimo enxergou o controle');
select pg_temp.exigir((select count(*) from client_files) = 0, 'anonimo enxergou arquivos');
select pg_temp.exigir((select count(*) from messages) = 0, 'anonimo enxergou mensagens');
select pg_temp.exigir((select count(*) from message_templates) = 0, 'anonimo enxergou os modelos de mensagem');
select pg_temp.exigir((select count(*) from v_control_board) = 0, 'anonimo enxergou a view do controle — falta security_invoker');
select pg_temp.exigir((select count(*) from v_client_documents) = 0, 'anonimo enxergou a view de documentos — falta security_invoker');

reset role;

-- ===========================================================================
-- 2. Perfil DESLIGADO nao ve nada
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select pg_temp.exigir((select count(*) from clients) = 0, 'perfil desligado continuou vendo clientes');
select pg_temp.exigir((select count(*) from monthly_controls) = 0, 'perfil desligado continuou vendo o controle');

-- ===========================================================================
-- 3. Analista ATIVA ve e opera
-- ===========================================================================
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select pg_temp.exigir(
  (select count(*) from clients where id in ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002')) = 2,
  'analista ativa nao enxergou os dois clientes'
);
select pg_temp.exigir(
  (select count(*) from v_control_board where id in ('c0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000b')) = 2,
  'analista ativa nao enxergou os dois controles na view'
);

update clients set notes = 'editado pela analista' where id = 'a0000000-0000-0000-0000-000000000001';
select pg_temp.exigir(
  (select notes from clients where id = 'a0000000-0000-0000-0000-000000000001') = 'editado pela analista',
  'analista ativa nao conseguiu editar o cliente'
);

-- Inativar e da analista (marca deleted_at); EXCLUIR de vez e so do admin.
with removido as (
  delete from clients where id = 'b0000000-0000-0000-0000-000000000002' returning 1
)
select pg_temp.exigir((select count(*) from removido) = 0, 'analista excluiu cliente — exclusao e do administrador');

-- Configuracao e do admin.
with alterado as (
  update message_templates set body = 'texto trocado pela analista' where kind = 'inform' returning 1
)
select pg_temp.exigir((select count(*) from alterado) = 0, 'analista alterou modelo de mensagem');

select pg_temp.exigir_recusa(
  $$insert into insurers (name) values ('Seguradora Inventada')$$,
  'analista cadastrou seguradora'
);

-- ===========================================================================
-- 4. A linha do tempo e APPEND-ONLY
-- ===========================================================================
with alterado as (
  update control_events set note = 'reescrevendo a historia'
  where control_id = 'c0000000-0000-0000-0000-00000000000a' returning 1
)
select pg_temp.exigir((select count(*) from alterado) = 0, 'UPDATE em control_events foi aceito');

with removido as (
  delete from control_events where control_id = 'c0000000-0000-0000-0000-00000000000a' returning 1
)
select pg_temp.exigir((select count(*) from removido) = 0, 'DELETE em control_events foi aceito');

-- Forjar autor tem que ser recusado pelo with check.
select pg_temp.exigir_recusa(
  $$insert into control_events (control_id, type, origin, actor_profile_id, note)
    values ('c0000000-0000-0000-0000-00000000000a', 'note', 'staff',
            '22222222-2222-2222-2222-222222222222', 'em nome do admin')$$,
  'analista registrou evento em nome de outra pessoa'
);

insert into control_events (control_id, type, origin, actor_profile_id, note)
values ('c0000000-0000-0000-0000-00000000000a', 'note', 'staff',
        '11111111-1111-1111-1111-111111111111', 'observacao da analista');

-- ===========================================================================
-- 5. Perfil de LEITURA le tudo e nao altera nada
-- ===========================================================================
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

select pg_temp.exigir(
  (select count(*) from clients where id = 'a0000000-0000-0000-0000-000000000001') = 1,
  'leitura nao enxergou o cliente'
);

with alterado as (
  update clients set notes = 'editado pela leitura' where id = 'a0000000-0000-0000-0000-000000000001' returning 1
)
select pg_temp.exigir((select count(*) from alterado) = 0, 'perfil de leitura editou cliente');

with alterado as (
  update monthly_controls set step = 'done' where id = 'c0000000-0000-0000-0000-00000000000a' returning 1
)
select pg_temp.exigir((select count(*) from alterado) = 0, 'perfil de leitura mudou o passo do controle');

select pg_temp.exigir_recusa(
  $$insert into clients (legal_name, document, invoice_day, due_day)
    values ('Cliente da Leitura', '99999997000109', 5, 10)$$,
  'perfil de leitura cadastrou cliente'
);

select pg_temp.exigir_recusa(
  $$insert into messages (control_id, kind, channel, to_address, body)
    values ('c0000000-0000-0000-0000-00000000000a', 'inform', 'email', 'x@exemplo.test', 'oi')$$,
  'perfil de leitura registrou mensagem'
);

-- ===========================================================================
-- 6. O CLIENTE so enxerga o que e dele
--
-- A propriedade mais importante do portal: o gestor do cliente A nao pode ver
-- nada do cliente B — nem o cadastro, nem o controle, nem a planilha, nem a
-- mensagem.
-- ===========================================================================
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

select pg_temp.exigir((select count(*) from clients) = 1, 'cliente A enxergou mais de um cadastro');
select pg_temp.exigir(
  (select id from clients) = 'a0000000-0000-0000-0000-000000000001',
  'cliente A enxergou o cadastro errado'
);
select pg_temp.exigir((select count(*) from monthly_controls) = 1, 'cliente A enxergou controle de outro cliente');
select pg_temp.exigir(
  (select count(*) from monthly_controls where client_id = 'b0000000-0000-0000-0000-000000000002') = 0,
  'cliente A enxergou o controle do cliente B'
);
select pg_temp.exigir((select count(*) from client_files) = 1, 'cliente A enxergou arquivo de outro cliente');
select pg_temp.exigir((select count(*) from messages) = 1, 'cliente A enxergou mensagem de outro cliente');
select pg_temp.exigir((select count(*) from v_control_board) = 1, 'cliente A enxergou outro cliente pela view do controle');
select pg_temp.exigir((select count(*) from v_client_documents) = 1, 'cliente A enxergou documento de outro cliente pela view');

-- O que e so da equipe.
select pg_temp.exigir((select count(*) from profiles) = 0, 'cliente enxergou a equipe');
select pg_temp.exigir((select count(*) from control_events) = 0, 'cliente enxergou a linha do tempo interna');
select pg_temp.exigir((select count(*) from message_templates) = 0, 'cliente enxergou os modelos de mensagem');
select pg_temp.exigir((select count(*) from client_users) = 1, 'cliente enxergou outros usuarios do portal');

-- O cliente nao muda o proprio passo nem o proprio cadastro: quem grava e o servidor.
with alterado as (
  update monthly_controls set step = 'done' where id = 'c0000000-0000-0000-0000-00000000000a' returning 1
)
select pg_temp.exigir((select count(*) from alterado) = 0, 'cliente mudou o passo do proprio controle');

with alterado as (
  update clients set due_day = 28 where id = 'a0000000-0000-0000-0000-000000000001' returning 1
)
select pg_temp.exigir((select count(*) from alterado) = 0, 'cliente mudou a propria regra de vencimento');

-- Envia planilha para si, em nome proprio.
insert into client_files (client_id, kind, storage_path, original_name, size_bytes, mime, uploaded_by_client_user)
values ('a0000000-0000-0000-0000-000000000001', 'spreadsheet',
        'a0000000-0000-0000-0000-000000000001/2026-09/enviada-pelo-cliente.xlsx', 'enviada-pelo-cliente.xlsx', 20,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- Nao envia para o cliente B.
select pg_temp.exigir_recusa(
  $$insert into client_files (client_id, kind, storage_path, original_name, size_bytes, mime, uploaded_by_client_user)
    values ('b0000000-0000-0000-0000-000000000002', 'spreadsheet',
            'b0000000-0000-0000-0000-000000000002/2026-09/invasao.xlsx', 'invasao.xlsx', 20,
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$,
  'cliente A enviou arquivo para o cliente B'
);

-- Nao escreve na linha do tempo. E por isso que o envio pelo portal passa pelo
-- servidor com a chave de administracao (lib/portal/servico.ts): o cliente
-- provoca o evento, mas nao e ele quem o grava.
select pg_temp.exigir_recusa(
  $$insert into control_events (control_id, type, origin, actor_client_user_id, from_step, to_step)
    values ('c0000000-0000-0000-0000-00000000000a', 'spreadsheet_received', 'client',
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'inform', 'spreadsheet_received')$$,
  'cliente gravou evento na linha do tempo'
);

-- Nem se tentar se passar por alguem da equipe.
select pg_temp.exigir_recusa(
  $$insert into control_events (control_id, type, origin, actor_profile_id, from_step, to_step)
    values ('c0000000-0000-0000-0000-00000000000a', 'checked', 'staff',
            '11111111-1111-1111-1111-111111111111', 'spreadsheet_received', 'checked')$$,
  'cliente gravou evento assinado pela equipe'
);

-- Nao envia boleto nem apolice: so planilha.
select pg_temp.exigir_recusa(
  $$insert into client_files (client_id, kind, storage_path, original_name, size_bytes, mime, uploaded_by_client_user)
    values ('a0000000-0000-0000-0000-000000000001', 'invoice',
            'a0000000-0000-0000-0000-000000000001/2026-09/boleto-falso.pdf', 'boleto-falso.pdf', 20,
            'application/pdf', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$,
  'cliente enviou boleto — so a equipe anexa boleto'
);

-- ===========================================================================
-- 7. Cliente INATIVADO perde o portal na hora
-- ===========================================================================
reset role;
update clients set active = false, deleted_at = now() where id = 'a0000000-0000-0000-0000-000000000001';

set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

select pg_temp.exigir((select count(*) from clients) = 0, 'cliente inativado continuou vendo o cadastro');
select pg_temp.exigir((select count(*) from monthly_controls) = 0, 'cliente inativado continuou vendo o controle');
select pg_temp.exigir((select count(*) from client_files) = 0, 'cliente inativado continuou vendo os arquivos');

-- ===========================================================================
-- 8. O bloqueio de login so muda pelo servidor
-- ===========================================================================
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select pg_temp.exigir_recusa(
  $$update profiles set failed_logins = 0 , full_name = 'Analista Teste'
    where id = '11111111-1111-1111-1111-111111111111' and failed_logins is distinct from 99$$,
  'a propria pessoa conseguiu rodar update que toca o contador',
  'ZZ001'
);

select pg_temp.exigir_recusa(
  $$update profiles set failed_logins = 7 where id = '11111111-1111-1111-1111-111111111111'$$,
  'a propria pessoa alterou o contador de senhas erradas'
);

select pg_temp.exigir_recusa(
  $$select login_bloqueado('analista@exemplo.test')$$,
  'usuario comum executou funcao que e so do servidor'
);

reset role;

rollback;

\echo 'RLS: todas as verificacoes passaram.'

-- ---------------------------------------------------------------------------
-- O portal do cliente sai. No lugar vem a COLETA POR LINK.
--
-- Decisao de 05/10: o projeto nao tera area do cliente logada. A MX manda um
-- link por WhatsApp e o gestor preenche ali mesmo, sem senha.
--
-- Por que remover de verdade, e nao deixar dormente: `client_users` e
-- `client_files` do cliente estavam com ZERO linhas — o portal subiu e nunca
-- foi usado, entao nada se perde. Tabela vazia com RLS e funcao de apoio e
-- superficie de ataque que ninguem revisa, porque ninguem lembra que existe.
--
-- O que NAO sai: `event_origin` continua tendo 'client'. O gestor que preenche
-- o link e um ator legitimo da linha do tempo — so nao e um usuario. Quem foi
-- passa a viver em `monthly_controls.manager_name`, na migration da coleta.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. As politicas que davam acesso ao cliente logado.
--
-- Primeiro as politicas, depois a funcao: `client_id_of_user()` nao cai
-- enquanto houver politica apontando para ela.
-- ---------------------------------------------------------------------------
drop policy if exists clients_select_own           on clients;
drop policy if exists policies_select_own          on policies;
drop policy if exists client_files_select_own      on client_files;
drop policy if exists client_files_insert_own      on client_files;
drop policy if exists monthly_controls_select_own  on monthly_controls;
drop policy if exists messages_select_own          on messages;

drop policy if exists client_users_select_staff on client_users;
drop policy if exists client_users_select_self  on client_users;
drop policy if exists client_users_write        on client_users;

-- A pasta do bucket deixa de ter leitor sem ser da equipe. O arquivo que o
-- gestor manda pelo link sobe pelo servidor, com a chave de administracao, e
-- desce por URL assinada de 2 minutos — como ja e com o boleto.
drop policy if exists client_files_own_read  on storage.objects;
drop policy if exists client_files_own_write on storage.objects;

-- ---------------------------------------------------------------------------
-- 2. As colunas de autor.
--
-- `client_files_um_autor` existia para garantir que o arquivo tinha UM autor,
-- equipe ou cliente. Sem cliente, sobra um so campo, e o check nao tem mais o
-- que decidir: `uploaded_by_profile` nulo passa a significar "veio pelo link".
-- ---------------------------------------------------------------------------
alter table client_files drop constraint if exists client_files_um_autor;
alter table client_files drop constraint if exists client_files_client_user_fk;
alter table client_files drop column    if exists uploaded_by_client_user;

comment on column client_files.uploaded_by_profile is
  'Quem da equipe anexou. Nulo quando o arquivo veio pelo link de coleta.';

alter table monthly_controls drop column if exists received_by_client_user;
alter table control_events   drop column if exists actor_client_user_id;

-- ---------------------------------------------------------------------------
-- 3. A tabela e a funcao.
-- ---------------------------------------------------------------------------
drop table    if exists client_users;
drop function if exists client_id_of_user();

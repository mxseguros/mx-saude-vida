-- Cria o PRIMEIRO acesso da equipe, para o sistema deixar de ser uma tela de
-- login sem ninguem do outro lado.
--
-- Como rodar (pelo workflow `Banco`, acao `acesso`):
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--        -v email="'pessoa@dominio'" -v senha="'...'" -v nome="'Nome Sobrenome'" \
--        -f scripts/criar-acesso.sql
--
-- A SENHA NAO MORA AQUI. Ela entra como variavel do psql, vinda de um secret
-- do GitHub — e secret e mascarado no log. Este repositorio e PUBLICO, e o log
-- do Actions de repositorio publico tambem e: senha impressa aqui seria senha
-- publicada.
--
-- Escreve direto em `auth.users` em vez de chamar a API de cadastro porque a
-- API exige a chave secreta do projeto, e a conexao de banco ja esta em maos
-- quando este script roda. A senha e gravada com o mesmo algoritmo que o
-- Supabase usa (bcrypt via pgcrypto), entao o login pelo formulario funciona
-- igual ao de um usuario criado pelo painel.
--
-- Idempotente: rodar de novo TROCA a senha e garante o perfil de admin, em vez
-- de falhar com e-mail duplicado. E o que se quer de um comando de emergencia
-- ("ninguem consegue entrar"), que e justamente quando ninguem quer ler
-- mensagem de erro.

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_email  text := lower(trim(:email));
  v_senha  text := :senha;
  v_nome   text := trim(:nome);
  v_id     uuid;
begin
  if v_email = '' or v_senha is null or length(v_senha) < 12 then
    raise exception 'Informe email e uma senha de pelo menos 12 caracteres.';
  end if;

  select id into v_id from auth.users where lower(email) = v_email;

  if v_id is null then
    v_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
      v_email, crypt(v_senha, gen_salt('bf')),
      -- Confirmado na criacao: nao ha caixa de e-mail esperando um link, e um
      -- acesso que nasce pendente e um acesso que nao existe.
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_nome),
      now(), now()
    );

    -- Sem esta linha o login acontece e o refresh token nao: a pessoa entra e
    -- cai fora na primeira renovacao, sem nada acusar erro.
    insert into auth.identities (
      provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      v_id, v_id,
      jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
      'email', now(), now(), now()
    )
    on conflict do nothing;

    raise notice 'Usuario criado: %', v_email;
  else
    update auth.users
       set encrypted_password = crypt(v_senha, gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           -- Tira o banimento que o bloqueio por senha errada aplica.
           banned_until = null,
           updated_at = now()
     where id = v_id;

    delete from auth.sessions where user_id = v_id;
    raise notice 'Senha redefinida: %', v_email;
  end if;

  -- O perfil e o que da acesso: sem linha ativa aqui, a sessao existe e o
  -- sistema recusa em `/sem-acesso`.
  insert into public.profiles (id, full_name, role, active)
  values (v_id, coalesce(nullif(v_nome, ''), v_email), 'admin', true)
  on conflict (id) do update
    set role = 'admin',
        active = true,
        failed_logins = 0,
        locked_at = null,
        full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name);
end;
$$;

commit;

-- O que confirma que deu certo, sem imprimir a senha.
select p.full_name as nome, u.email, p.role as papel, p.active as ativo,
       (u.encrypted_password is not null) as tem_senha,
       (u.email_confirmed_at is not null) as email_confirmado
  from public.profiles p
  join auth.users u on u.id = p.id
 order by p.created_at desc
 limit 5;

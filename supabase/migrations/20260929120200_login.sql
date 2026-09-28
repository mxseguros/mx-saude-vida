-- MX SaudeVida — bloqueio na terceira senha errada
--
-- Tres senhas erradas seguidas bloqueiam o acesso; so o administrador libera,
-- redefinindo a senha em Configuracoes. Vale para a equipe inteira,
-- administrador inclusive.
--
-- Onde cada coisa mora:
--   - A contagem fica em `profiles` (failed_logins, locked_at) e SO o servidor
--     escreve nela: as tres funcoes abaixo sao `security definer`, sem
--     execucao para `anon` nem `authenticated`, e um gatilho recusa que a
--     propria pessoa mexa nas duas colunas pela API.
--   - Bloqueado deixa de ser membro: `is_active_member`, `can_write` e
--     `is_admin` exigem `locked_at is null` (migration de RLS). E isso que
--     derruba NA HORA quem ja estava dentro.
--   - As sessoes do Auth sao apagadas no bloqueio, e o app ainda bane o
--     usuario no Auth, que e o que recusa quem tentar a senha direto no
--     Supabase, fora do formulario.
--
-- O cliente do portal nao tem linha em `profiles`: para ele as funcoes
-- respondem "nao existe" e o login segue a regra do proprio Auth.

-- As duas colunas so mudam pelo servidor.
create or replace function profiles_trava_bloqueio()
returns trigger
language plpgsql
as $$
begin
  if (new.failed_logins is distinct from old.failed_logins
      or new.locked_at is distinct from old.locked_at)
     and current_user in ('authenticated', 'anon') then
    raise exception 'failed_logins e locked_at so mudam pelo servidor'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_trava_bloqueio on profiles;
create trigger profiles_trava_bloqueio
  before update on profiles
  for each row execute function profiles_trava_bloqueio();

-- O e-mail esta bloqueado? Pergunta feita ANTES de tentar a senha.
create or replace function login_bloqueado(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
      from auth.users u
      join public.profiles p on p.id = u.id
     where lower(u.email) = lower(p_email)
       and p.locked_at is not null
  );
$$;

-- Conta uma senha errada; na terceira, bloqueia e derruba as sessoes.
create or replace function registrar_falha_de_login(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid;
  n int;
  travou boolean := false;
begin
  select u.id into uid from auth.users u where lower(u.email) = lower(p_email) limit 1;
  if uid is null then
    return jsonb_build_object('existe', false, 'bloqueado', false);
  end if;

  update public.profiles
     set failed_logins = failed_logins + 1,
         locked_at = case when failed_logins + 1 >= 3 and locked_at is null then now() else locked_at end
   where id = uid
  returning failed_logins, locked_at is not null into n, travou;

  if not found then
    return jsonb_build_object('existe', false, 'bloqueado', false);
  end if;

  if travou then
    -- Derrubar na hora: sem sessao, o refresh token morre. Se o papel dono da
    -- funcao nao puder apagar em `auth`, a contagem NAO pode falhar por isso.
    begin
      delete from auth.sessions where user_id = uid;
    exception when others then
      null;
    end;
  end if;

  return jsonb_build_object('existe', true, 'bloqueado', travou, 'user_id', uid, 'falhas', n);
end;
$$;

-- Acertou a senha, ou o administrador redefiniu: volta a zero e libera.
create or replace function zerar_falhas_de_login(p_user uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set failed_logins = 0, locked_at = null
   where id = p_user and (failed_logins <> 0 or locked_at is not null);
$$;

revoke all on function login_bloqueado(text) from public, anon, authenticated;
revoke all on function registrar_falha_de_login(text) from public, anon, authenticated;
revoke all on function zerar_falhas_de_login(uuid) from public, anon, authenticated;
grant execute on function login_bloqueado(text) to service_role;
grant execute on function registrar_falha_de_login(text) to service_role;
grant execute on function zerar_falhas_de_login(uuid) to service_role;

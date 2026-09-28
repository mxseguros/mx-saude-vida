-- MX SaudeVida — armazenamento de arquivos
--
-- A planilha do mes, o boleto e a apolice carregam dado pessoal: nome, CPF e
-- data de nascimento de cada funcionario do cliente. Por isso o bucket e
-- PRIVADO e o acesso e sempre por URL assinada de vida curta, gerada no
-- servidor para quem tem sessao.
--
-- Caminho do objeto: <client_id>/<pasta>/<uuid>-<nome>. A primeira pasta e o
-- que a politica do cliente confere: ele so alcanca o que esta sob o proprio
-- client_id.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'client-files',
  'client-files',
  false,                     -- privado, sempre
  20971520,                  -- 20 MB: cabe apolice escaneada e planilha grande
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Politicas do Storage. Nenhuma para `anon`.
-- ---------------------------------------------------------------------------
create policy client_files_staff_read on storage.objects
  for select to authenticated
  using (bucket_id = 'client-files' and is_active_member());

create policy client_files_staff_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'client-files' and can_write());

-- Apagar objeto e do administrador. Arquivo removido por engano no meio do
-- mes nao volta; na operacao, remover e marcar `deleted_at` na ficha.
create policy client_files_admin_remove on storage.objects
  for delete to authenticated
  using (bucket_id = 'client-files' and is_admin());

-- O cliente le e envia so sob a propria pasta.
create policy client_files_own_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'client-files'
    and client_id_of_user() is not null
    and (storage.foldername(name))[1] = client_id_of_user()::text
  );

create policy client_files_own_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'client-files'
    and client_id_of_user() is not null
    and (storage.foldername(name))[1] = client_id_of_user()::text
  );

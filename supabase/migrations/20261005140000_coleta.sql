-- ---------------------------------------------------------------------------
-- A COLETA POR LINK.
--
-- O gestor do cliente recebe um link por WhatsApp e informa quem entrou e quem
-- saiu, sem senha. Nao ha tabela de "coleta": a coleta E O MES.
--
-- Por que nao uma tabela propria: ela guardaria o mesmo estado que
-- `monthly_controls` ja guarda — o passo, a planilha, a data de recebimento —
-- e dois lugares com o mesmo estado divergem. E o erro que a agenda derivada
-- ja evitou neste projeto.
--
-- Por isso tambem nao entram `collection_submitted_at` nem um "sem mudancas"
-- novo: `received_at` e `no_changes` existem desde a base e querem dizer
-- exatamente isso. O que entra aqui e so o que nao tinha onde morar.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. O link, e quem o recebeu.
--
-- O gestor fica NO MES, nao no cliente: quem informa pode mudar de um mes para
-- o outro, e sobrescrever o cadastro apagaria o contato que a MX usa para o
-- resto do ano.
-- ---------------------------------------------------------------------------
alter table monthly_controls
  add column collection_token      text,
  add column collection_expires_at timestamptz,
  add column collection_opened_at  timestamptz,
  add column manager_name          text,
  add column manager_phone         text,
  add column manager_sector        text;

-- Unico, e indexado para a busca pelo token na rota publica ser por indice: a
-- rota e aberta na internet, e varredura de tabela ali e porta de negacao de
-- servico.
create unique index monthly_controls_collection_token_key
  on monthly_controls (collection_token)
  where collection_token is not null;

comment on column monthly_controls.collection_token is
  'O que vai na URL de /coleta. Nulo enquanto a analista nao gerar o link.';
comment on column monthly_controls.collection_expires_at is
  'Ate quando o link abre. Decisao de 05/10: ate o fim do dia do corte.';
comment on column monthly_controls.collection_opened_at is
  'Quando o gestor abriu o link pela primeira vez. Alimenta a coluna '
  '"Ultima mensagem" do Controle: aberto e diferente de entregue.';
comment on column monthly_controls.manager_sector is
  'Setor de quem informou ("Producao"). Pode ficar em branco — campo que '
  'obriga sem precisar e beco sem saida.';

-- O token so existe com validade. Link sem prazo e link eterno, e um link
-- eterno na mao de um ex-funcionario e um vazamento que ninguem fecha.
alter table monthly_controls
  add constraint monthly_controls_token_com_prazo
  check (
    (collection_token is null and collection_expires_at is null)
    or (collection_token is not null and collection_expires_at is not null)
  );

-- ---------------------------------------------------------------------------
-- 2. As pessoas que entraram e sairam.
--
-- Uma linha por pessoa, e nao um jsonb: a conferencia da Fase 5 CRUZA estas
-- linhas com a planilha, e cruzamento quer tabela.
-- ---------------------------------------------------------------------------
create type movement_kind as enum ('entry', 'exit');

-- Quem digitou. O selo na tela sai daqui, e a conferencia trata diferente:
-- o que o gestor informou e o que se cruza com a planilha dele.
create type movement_source as enum ('manager', 'staff');

create table movements (
  id bigserial primary key,
  control_id uuid not null references monthly_controls(id) on delete cascade,
  kind movement_kind not null,
  full_name text not null check (length(btrim(full_name)) > 0),
  -- CPF, so digitos. Anulavel: o gestor que nao tem o CPF a mao informa o nome
  -- e a analista completa pela planilha. Exigir o CPF aqui faria o gestor
  -- inventar um para o formulario deixar passar.
  document text check (document is null or document ~ '^[0-9]{11}$'),
  source movement_source not null,
  created_at timestamptz not null default now()
);

create index movements_control_idx on movements (control_id, kind, created_at);

comment on table movements is
  'Quem entrou e quem saiu no mes, como informado no formulario de coleta.';

-- ---------------------------------------------------------------------------
-- 3. O evento.
--
-- O link e uma acao da operacao, e toda mudanca vira evento (regra 4).
-- ---------------------------------------------------------------------------
alter type control_event_type add value if not exists 'link_sent';
alter type control_event_type add value if not exists 'link_opened';

-- ---------------------------------------------------------------------------
-- 4. RLS.
--
-- NENHUMA politica para `anon` (regra 7). O formulario publico nao fala com o
-- banco: ele chama uma rota de servidor que confere o token e escreve com a
-- chave de administracao, que ignora a RLS. E o mesmo desenho do envio pelo
-- portal que acabou de sair, e pelo mesmo motivo — o token prova que a pessoa
-- recebeu o link, nao QUEM ela e, e isso nao da para perguntar em SQL.
-- ---------------------------------------------------------------------------
alter table movements enable row level security;

create policy movements_select_staff on movements
  for select to authenticated
  using (is_active_member());

create policy movements_write on movements
  for all to authenticated
  using (can_write())
  with check (can_write());

-- ---------------------------------------------------------------------------
-- 5. Retencao (LGPD).
--
-- `movements` guarda nome e CPF — a mesma classe de dado da planilha, porque e
-- uma transcricao dela. Criar um deposito novo de CPF sem prazo de validade
-- seria desfazer em silencio a retencao que o projeto ja tem.
--
-- O prazo e O MESMO da planilha, e por isso le `retention_rules` em vez de ter
-- numero proprio: dois prazos para o mesmo dado divergem na primeira
-- orientacao juridica, e a MX ficaria com o CPF em `movements` depois de ja ter
-- apagado a planilha de onde ele veio.
--
-- Funcao e nao view, ao contrario de `v_files_to_purge`: ali o cron precisa da
-- LISTA porque tem de apagar o objeto no Storage antes de marcar a ficha. Aqui
-- nao ha nada fora do banco, e a linha some de uma vez — apagar em lote e uma
-- declaracao a menos que pode dar errado no meio.
-- ---------------------------------------------------------------------------
create or replace function limpar_movimentacao_vencida()
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

  -- A conta e pela COMPETENCIA, nao por `created_at` da linha: o mes de
  -- setembro de 2024 vence no mesmo dia para todo mundo, mesmo que a analista
  -- tenha digitado a movimentacao com atraso em dezembro.
  delete from movements m
   using monthly_controls c
   where c.id = m.control_id
     and c.competence + make_interval(months => v_meses) < current_date;

  get diagnostics v_apagadas = row_count;
  return v_apagadas;
end;
$$;

revoke all on function limpar_movimentacao_vencida() from public, anon, authenticated;
grant execute on function limpar_movimentacao_vencida() to service_role;

comment on function limpar_movimentacao_vencida is
  'Apaga quem entrou e quem saiu de competencias vencidas, no prazo da planilha. Chamada pelo cron.';

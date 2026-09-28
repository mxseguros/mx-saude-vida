-- MX SaudeVida — seeds de configuracao
--
-- So CONFIGURACAO: seguradoras e os cinco modelos de mensagem. Nenhum cliente,
-- nenhuma pessoa. A base sintetica de clientes sai de um script, e a base real
-- e carregada por script local, de fora do repositorio.
--
-- Idempotente: pode rodar de novo sem duplicar nem sobrescrever o que o
-- administrador ja editou em Configuracoes.

-- ---------------------------------------------------------------------------
-- Seguradoras
-- ---------------------------------------------------------------------------
insert into insurers (name) values
  ('Allianz'),
  ('Amil'),
  ('Bradesco'),
  ('Capemisa'),
  ('Chubb'),
  ('HDI'),
  ('Icatu'),
  ('MAG'),
  ('MedSênior'),
  ('MetLife'),
  ('Porto'),
  ('Prudential'),
  ('Sompo'),
  ('SulAmérica'),
  ('Sura'),
  ('Tokio Marine'),
  ('Uniodonto'),
  ('Yelum'),
  ('Zurich')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Modelos de mensagem
--
-- Variaveis entre chaves duplas. A lista fechada esta em
-- apps/web/lib/dominio/mensagem.ts (VARIAVEIS_DA_MENSAGEM).
-- ---------------------------------------------------------------------------
insert into message_templates (kind, default_channel, subject, body) values
  (
    'inform', 'whatsapp',
    'Movimentação de {{mes}} — {{cliente}}',
    'Olá, {{gestor}}! A movimentação de {{mes}} do seguro da {{cliente}} precisa chegar até {{data}}. Entre no portal e envie a planilha do mês: {{link}}

Se não houve mudanças, é só marcar "Não houve mudanças".

{{analista}} — {{corretora}}'
  ),
  (
    'cutoff', 'whatsapp',
    'Movimentação de {{mes}} enviada — {{cliente}}',
    '{{gestor}}, a movimentação de {{mes}} da {{cliente}} foi enviada à {{seguradora}} dentro do corte ({{data_corte}}). O boleto sai em {{data_boleto}} e você recebe por aqui.

{{analista}} — {{corretora}}'
  ),
  (
    'invoice', 'email',
    'Boleto de {{mes}} — {{cliente}}',
    '{{gestor}}, o boleto de {{mes}} da {{cliente}} está disponível: {{valor}}, vencimento {{data_vencimento}}.

Ele está no seu portal, em Meus documentos: {{link}}

{{analista}} — {{corretora}}'
  ),
  (
    'due', 'whatsapp',
    'Lembrete de vencimento — {{cliente}}',
    '{{gestor}}, lembrete: o boleto de {{mes}} da {{cliente}} ({{valor}}) vence em {{data_vencimento}}. Se já pagou, desconsidere.

{{analista}} — {{corretora}}'
  ),
  (
    'correction', 'whatsapp',
    'Planilha de {{mes}} — precisamos de um ajuste',
    '{{gestor}}, a planilha de {{mes}} da {{cliente}} chegou, mas {{motivo}}. Pode reenviar pelo portal? {{link}}

{{analista}} — {{corretora}}'
  )
on conflict (kind) do nothing;

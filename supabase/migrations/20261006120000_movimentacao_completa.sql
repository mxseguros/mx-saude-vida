-- ---------------------------------------------------------------------------
-- Quem ENTROU passa a ter nascimento, cargo e salario.
--
-- Pedido do Gabriel (06/10): entrada com Nome, CPF, Data de nascimento, Cargo
-- e Salario; saida so com Nome e CPF.
--
-- A diferenca entre as duas e o que a seguradora pede. Para INCLUIR alguem ela
-- precisa da idade (o premio e o limite de idade da apolice dependem dela), do
-- cargo (o capital da Prudential e por cargo) e do salario (capital em
-- multiplo salarial). Para EXCLUIR basta saber quem e.
--
-- Anulaveis, como o CPF: o gestor que nao tem o dado a mao informa o nome e a
-- MX completa. Exigir faria ele inventar um nascimento para o formulario
-- deixar passar — e o premio seria calculado sobre uma idade falsa.
-- ---------------------------------------------------------------------------
alter table movements
  add column birth_date date,
  add column job_title  text check (job_title is null or length(btrim(job_title)) between 1 and 80),
  add column salary     numeric(12, 2) check (salary is null or salary >= 0);

-- Saida nao carrega dado de inclusao. Se carregasse, a conferencia e o envio
-- a seguradora teriam de decidir o que fazer com o cargo de quem esta saindo —
-- e a resposta e "nada". O check impede o dado de existir em vez de ensinar
-- cada leitor a ignora-lo.
alter table movements
  add constraint movements_saida_sem_dado_de_inclusao
  check (kind = 'entry' or (birth_date is null and job_title is null and salary is null));

-- Nascimento no futuro e erro de digitacao, e nascimento de mais de 120 anos
-- tambem. O formulario ja recusa os dois; o check e o cinto para o que nao
-- passa pelo formulario (script, correcao manual).
alter table movements
  add constraint movements_nascimento_plausivel
  check (birth_date is null or (birth_date > date '1900-01-01' and birth_date <= current_date));

comment on column movements.salary is
  'Salario informado na entrada. Dado pessoal sensivel ao negocio: sai com a mesma retencao do resto da linha.';

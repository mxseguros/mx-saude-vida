-- MX SaudeVida — o mesmo CNPJ pode ter mais de um ramo
--
-- O CONTROLE FATURAS tem 28 linhas que sao a MESMA empresa num segundo ramo:
-- o mesmo CNPJ com VIDA na Zurich e SAUDE na Porto, cada um com seu corte e seu
-- vencimento. Uma linha do Excel = um controle mensal, e e assim que a operacao
-- funciona hoje.
--
-- `document text not null unique` assumia uma linha por empresa, e por isso
-- recusava 28 cadastros reais.
--
-- A troca NAO e "tirar o unique". Sem constraint nenhuma, o cadastro duplicado
-- por engano — a analista salvando duas vezes — entraria calado, e duas linhas
-- iguais no Controle significam duas mensagens para o mesmo gestor no mesmo dia.
-- `unique (document, product)` permite o segundo ramo e continua barrando a
-- duplicata de verdade.
--
-- Fica de fora um caso: o mesmo CNPJ com o MESMO ramo em duas seguradoras
-- (acontece em 1 linha da planilha). Ele continua sendo recusado, de proposito:
-- e raro o bastante para merecer um olhar humano, e colocar `insurer_id` na
-- chave deixaria a constraint sem serventia nenhuma — seguradora nula nao
-- participa de unicidade.

alter table clients drop constraint if exists clients_document_key;

create unique index if not exists clients_documento_ramo_idx on clients (document, product);

comment on index clients_documento_ramo_idx is
  'Uma linha por CNPJ e ramo. O mesmo CNPJ com VIDA e SAUDE sao dois cadastros, com datas proprias.';

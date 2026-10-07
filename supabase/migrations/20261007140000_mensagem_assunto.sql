-- E-mail pelo Outlook de quem envia (07/10): a mensagem pendente guarda o
-- assunto, para a analista abrir o e-mail pronto a partir da fila.
alter table messages add column if not exists subject text;

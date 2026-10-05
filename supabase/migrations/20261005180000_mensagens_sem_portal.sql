-- ---------------------------------------------------------------------------
-- As mensagens param de mandar o cliente ao portal.
--
-- Os modelos entraram pelo seed quando o portal existia, e tres deles dizem
-- "entre no portal" com `{{link}}` apontando para `/portal`. Essa rota saiu em
-- 05/10: o link agora redireciona para uma tela de login que o gestor nao tem
-- como usar.
--
-- Isso NAO daria erro em lugar nenhum. A mensagem sairia bonita, com um
-- endereco que leva a um beco — e a MX descobriria pelo telefone, no dia do
-- corte, com 177 clientes sem informar.
--
-- O QUE `{{link}}` PASSA A SIGNIFICAR: o link de coleta daquele mes, e so nas
-- mensagens que pedem movimentacao (`inform` e `correction`). Nas outras ele
-- renderiza vazio, porque nao ha para onde mandar: o boleto vai anexado no
-- e-mail, e o aviso de corte e de vencimento nao pede nada de volta.
--
-- `update ... where body like` e nao `update` cego: se a MX ja reescreveu um
-- modelo em Configuracoes, o texto dela vence. Sobrescrever o que a equipe
-- ajustou seria desfazer trabalho sem avisar.
-- ---------------------------------------------------------------------------

update message_templates
   set body = 'Olá, {{gestor}}! A movimentação de {{mes}} do seguro da {{cliente}} precisa chegar até {{data}}.

É rápido, pelo celular: {{link}}

Se ninguém entrou nem saiu, dá para confirmar isso no mesmo link.

{{analista}} — {{corretora}}',
       updated_at = now()
 where kind = 'inform'
   and body like '%Entre no portal%';

update message_templates
   set body = '{{gestor}}, o boleto de {{mes}} da {{cliente}} está disponível: {{valor}}, vencimento {{data_vencimento}}.

Ele vai anexado neste e-mail.

{{analista}} — {{corretora}}',
       updated_at = now()
 where kind = 'invoice'
   and body like '%no seu portal%';

update message_templates
   set body = '{{gestor}}, a planilha de {{mes}} da {{cliente}} chegou, mas {{motivo}}.

Pode mandar de novo? É pelo mesmo link: {{link}}

{{analista}} — {{corretora}}',
       updated_at = now()
 where kind = 'correction'
   and body like '%pelo portal%';

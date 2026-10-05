# MX SaúdeVida — convenções do repositório

Controle mensal de seguros saúde, vida e odonto. Base clonada **por cópia** do MX Sinistro; nunca criar dependência entre os repositórios. O plano está em `documentacao/plano-de-desenvolvimento.md`. Em dúvida de layout, o protótipo v0.8 (pasta `Docs/` local, fora do git) vence o texto.

## Regra zero: o repositório é público

- Nenhum nome, CNPJ, CPF, e-mail ou telefone real em código, comentário, seed, fixture, teste, mensagem de commit ou documentação.
- `Docs/` fica inteira fora do git. `*.xlsx`, `*.xls`, `*.csv`, `*.pdf` e `*.docx` estão no `.gitignore`, sem exceção.
- Dado sintético usa CPF iniciado em 999, telefone 5555 e domínio `@exemplo.test`.
- Identificadores de infraestrutura (projeto Vercel, referência do Supabase) vêm de secrets, não de arquivo.
- Scripts de carga leem a planilha real de fora do repositório e rodam só contra o banco, nunca deixam arquivo aqui.

## Ambiente

- `pnpm` só via corepack: `corepack pnpm <comando>`. Node 24.
- Um projeto Supabase: produção é o palco de ensaio até o go-live. Nada de dado real antes da virada.
- Migration antes do push do código que depende dela. `vercel.json` não aceita comentário.

## Arquitetura

1. **Banco e API em inglês, app em português.** A tradução acontece só em `lib/dominio/mapear.ts`.
2. **Listas em tabela, não no código.** Seguradoras e modelos de mensagem são editáveis em Configurações.
3. **A regra mora no servidor.** O mesmo esquema zod valida no navegador e na rota; a rota devolve todos os erros de uma vez, com o campo de cada um.
4. **Toda mudança vira evento.** `control_events` é append-only pela RLS. Se o evento falhar, a mudança é revertida.
5. **Remover é desativar.** Cliente e usuário inativos ficam no histórico (`deleted_at`, `is_active`).
6. **Arquivo em bucket privado**, com URL assinada de 2 minutos e upload pelo cliente da sessão.
7. **Função de banco que escreve checa o papel explicitamente.** `security definer` tem `revoke` de `anon` e `authenticated`. Views sempre com `security_invoker`.
8. **O middleware nunca lança.** Rota protegida nova entra em `ROTAS_PROTEGIDAS` e em `e2e/fumaca.spec.ts` no mesmo commit. Acesso tem quatro estados: ok, sem sessão, sem acesso, indisponível.
9. **Autorização sempre por `lib/api.ts`**: `exigirPerfil`, `exigirEscrita`, `exigirAdmin`. O perfil `leitura` não altera nada.
10. **Um público logado só: a equipe.** O cliente não tem conta — o gestor recebe um **link** de coleta e preenche sem senha. Nenhuma política de RLS para `anon`: a rota pública confere o token no servidor e escreve com a chave de administração.
11. **A chave secreta vive só em `lib/supabase/administrador.ts` e nos scripts.**
12. **IA propõe, código decide.** Só a leitura do PDF da apólice usa modelo. Prompt versionado, teto diário, cache por hash, `ai_runs` como livro-caixa. A conferência da planilha é código.
13. **Log estruturado sem dado pessoal** (`lib/log.ts`). Todo 5xx é registrado com código e status, nunca com a mensagem.
14. **Mensagens**: modelos em `message_templates`; e-mail sai pelo servidor; WhatsApp é um link `wa.me` aberto no clique da analista; tudo registrado em `messages`.

## Interface

- Celular é a classe base; desktop em `sm:` e `md:`. Inputs com 16px no celular.
- `LinkBotao` para navegar, `Botao` para agir. `useCamadaSobreposta` em modal e gaveta.
- **CTAs em três cores**: Azul MX para a ação principal; Areia MX com fonte branca para secundárias; verde e vermelho só em alerta (confirmação final, ação destrutiva).
- **Prazo vencido é fonte vermelha, nunca fundo vermelho.** Âmbar até 3 dias antes; navy no passo atual; riscado quando cumprido.
- **Tabela não rola de lado.** Largura fixa por coluna, texto quebra na célula.
- Campos alinhados: rótulo e controle com a mesma altura em toda grade.
- Tokens definidos nos três estados de tema, com contraste AA.
- Beco sem saída é defeito: a tela diz o que falta e onde resolver antes do clique.

## Testes

- Vitest só em função pura (`testes/`). E2E se ancora em elemento de função, nunca em texto de tela.
- `pnpm audit --prod --audit-level high` no CI.
- Novo valor de enum nasce no banco com caso no `supabase/tests/rls.sql`.
- Antes de push que mexe em tela: `corepack pnpm --filter @mx/saudevida-web e2e`.

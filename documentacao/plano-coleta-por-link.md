# MX SaúdeVida — coleta por link, no lugar do portal

**05/10/2026 · para aprovação** · Protótipo de referência: **v0.7**, telas `tLink` (analista) e `tFormLink` (gestor)

Decisão do Gabriel: **o projeto não terá área do cliente logada.** No lugar, a MX manda um **link** por WhatsApp e o gestor preenche ali mesmo, sem senha. Depois a MX **verifica os dados apontados** e o mês segue o fluxo do protótipo.

---

## 1. O que sai

O portal da Sprint 3 inteiro. Ele **nunca foi usado** — `client_users` e `client_files` estão com **zero linhas** em produção, então nada se perde a não ser o código.

| Sai | Linhas |
|---|---|
| `app/(portal)/` — layout, moldura, Painel, Enviar planilha, Meus documentos | ~1.100 |
| `lib/portal/` — consulta, serviço, sessão | ~450 |
| `app/api/portal/` — planilha, envio, arquivo | ~230 |
| Seção "Acesso ao portal" na ficha do cliente | ~400 |
| `client_users` (tabela, RLS, funções), rotas de acesso | migration |

**Sai de verdade, não fica dormente.** Código morto apodrece e confunde quem abre o repositório depois. O histórico do git guarda tudo, e a migration de remoção é reversível enquanto as tabelas estiverem vazias.

**O que fica, porque serve ao link:** o upload com progresso por XHR, o serviço de arquivos, o bucket privado, a máquina de passos, o stepper em pílulas, e o `linkWhatsapp` que já monta `wa.me` com texto pronto.

---

## 2. O que entra

### 2.1 Banco

Nenhuma tabela de "coleta". A coleta **é o mês**, e inventar uma tabela paralela criaria dois lugares guardando o mesmo estado — o erro que já evitei nas atividades.

```sql
-- Em monthly_controls:
collection_token      text unique    -- o que vai na URL
collection_expires_at timestamptz    -- "link vale até"
collection_opened_at  timestamptz    -- quando o gestor abriu
manager_name          text           -- quem recebeu o link neste mês
manager_phone         text
manager_sector        text           -- "Produção". Pode ficar em branco

-- Tabela nova, para as pessoas:
create table movements (
  id, control_id fk, kind 'entrada'|'saida',
  full_name text not null, document text,   -- CPF
  source 'gestor'|'equipe',                 -- quem digitou
  created_at
);
```

O gestor e o celular ficam **no mês**, não no cliente: quem informa pode mudar de um mês para o outro, e sobrescrever o cadastro do cliente apagaria o contato que a MX usa para o resto.

**RLS:** nenhuma política para `anon`, como manda a regra 7 do `CLAUDE.md`. O formulário público escreve por uma rota de servidor que valida o token e usa a chave de administração — o mesmo desenho do envio pelo portal, e pelo mesmo motivo.

### 2.2 Tela da analista — `/controle/[id]/coleta`

Moldura do v0.7:

- Bloco **"Enviar formulário por WhatsApp"** no topo: Gestor responsável + Celular → **"Abrir o WhatsApp com o link"**
- Divisor **"ou preencha agora"**
- O mesmo formulário de 5 etapas, para quando o gestor mandou por fora e a analista digita
- **"Registrar coleta"** → o mês entra no Controle aguardando o gestor

### 2.3 Formulário do gestor — `/coleta/[token]`

**Público, sem login.** Cabeçalho com a marca MX e "🔒 Página segura".

| Etapa | O quê |
|---|---|
| 1 · Seus dados | Empresa e CNPJ **travados** (vêm do cadastro); Seu nome; **Setor** — pode ficar em branco; Celular. Atalho **"Ninguém entrou nem saiu em setembro"** |
| 2 · Quem entrou | Cartões Nome completo + CPF · "+ Adicionar outra pessoa" |
| 3 · Quem saiu | Idem |
| 4 · Planilha | Upload **opcional** — "quem não tem planilha pode pular: o que você digitou já basta" |
| 5 · Revisão | Linhas com "✎ Editar" + o aviso de LGPD |

**Sucesso:** "Recebemos, Diego." + os marcos do que vem + protocolo + **"Este link continua aberto para você"**.

> **Os selos "✦ apólice"** da sua tela: os campos que vieram da apólice lida pelo agente aparecem marcados. O agente já está pronto — é só ligar quando a Fase G chegar. Até lá os campos vêm do cadastro e o selo fica de fora.

### 2.4 A verificação

É o ponto que você destacou: *"após receber a planilha passa por uma verificação dos dados apontados"*.

A tela `/controle/[id]/conferir` já lê a planilha e aponta campo em branco e CPF inválido. Ela passa a **cruzar** o que o gestor digitou com o que a planilha traz:

- CPF que o gestor informou e **não está** na planilha
- Pessoa na planilha que o gestor **não informou**
- CPF informado duas vezes
- Entrada sem data de admissão

Nada disso **impede** conferir — aponta, como já é com o campo em branco. Quem decide é a analista.

---

## 3. As entregas

### Fase 1 — Tirar o portal *(~0,5 dia)*

- [x] **1.1** Remover `(portal)`, `lib/portal`, `api/portal` e a seção de acesso na ficha
- [x] **1.2** Migration: remover `client_users` e suas políticas; simplificar a raiz e as molduras
- [x] **1.3** Tirar os casos de `client_users` do teste de RLS e as rotas do smoke

### Fase 2 — O banco da coleta *(~0,5 dia)*

- [x] **2.1** Migration: os campos em `monthly_controls` e a tabela `movements`
- [x] **2.2** RLS: equipe lê e escreve; **nenhuma política para `anon`**
- [x] **2.3** Geração do token — aleatório, 32 bytes, com validade

### Fase 3 — O formulário do gestor *(~2 dias)*

- [x] **3.1** Rota pública `/coleta/[token]`, fora de `ROTAS_PROTEGIDAS`
- [x] **3.2** As 5 etapas, com o stepper em pílulas
- [x] **3.3** Cartões de pessoa com validação de CPF (a regra já existe em `documento.ts`)
- [x] **3.4** Atalho "Ninguém entrou nem saiu"
- [x] **3.5** Upload opcional, reusando o XHR com progresso
- [x] **3.6** Tela de sucesso com protocolo e marcos; o link continua abrindo
- [x] **3.7** Token expirado, mês já enviado e token inválido com tela própria — **nunca** um 404 seco

### Fase 4 — A tela da analista *(~1 dia)*

- [x] **4.1** `/controle/[id]/coleta` com o bloco do WhatsApp e o divisor
- [x] **4.2** O mesmo formulário de 5 etapas para a analista
  - ⚠️ **Entregue numa página só, não em 5 passos.** Mesmas seções, mesma ordem, mesmo esquema zod — mas sem paginação: o gestor preenche no celular, onde uma pergunta por vez é o que cabe; a analista está no computador com o cliente ditando nomes ao telefone, e cinco cliques entre "Maria" e "João" são cinco chances de perder o fio.
- [x] **4.3** Botão na linha do Controle: "Enviar link" quando o passo é `informar`
- [x] **4.4** A coluna "Última mensagem" passa a mostrar quando o link foi aberto

### Fase 5 — A verificação *(~1 dia)*

- [x] **5.1** `/controle/[id]/conferir` mostra as entradas e saídas digitadas
- [x] **5.2** O cruzamento digitado × planilha, com os quatro apontamentos
- [x] **5.3** Função pura e testada, com "hoje" por parâmetro, como o resto do domínio

**Total: ~5 dias.**

---

## 4. O que isso muda nos planos anteriores

| Antes | Agora |
|---|---|
| Sprint 3 — portal do cliente | ❌ removida |
| Fase A do v3 — busca e filtros no Controle | ⏸️ depois da coleta |
| `SUPABASE_AUTH_HOOK_SECRET` | ❌ não é mais necessário — não há senha de cliente |
| Os 86 clientes sem contato | ⚠️ **fica mais grave**: sem celular não há como mandar o link |

---

## 5. O que você respondeu, e o que ficou

Respondido em 05/10, e tudo já está no código:

- [x] **1. Remover o portal** — removido, com migration. `client_users` e as políticas saíram
- [x] **2. O link vale até o corte** — com piso de 3 dias, porque link mandado depois do corte nasceria morto
- [x] **3. O gestor pode corrigir depois de enviar, com alerta ao analista** — o passo **não** volta (voltar faria o mês perder a conferência por uma correção de uma letra); o alerta é derivado na `v_control_board` e aparece em vermelho no topo da tela de coleta
- [x] **4. O analista verifica** — os quatro apontamentos em `/controle/[id]/conferir`, e nenhum impede conferir
- [x] **5 e 6. WhatsApp, e ele é prioridade** — é o botão principal da tela, e o passo `informar` do Controle agora leva direto a ela
- [x] **7. Senha criada pelo admin** — nada mudou: o gestor nunca teve senha, e agora nem conta

### Ainda depende de você

- [ ] **Os clientes sem celular do gestor** — sem celular não há WhatsApp a mandar. O e-mail de "informar até" já sai com o mesmo link, então quem tem e-mail está coberto; quem não tem nenhum dos dois não pode ser avisado por nenhum caminho
- [ ] **O provedor de e-mail** (Graph ou Resend) — sem isso **nenhuma mensagem sai sozinha**. O WhatsApp funciona hoje, porque é a analista que clica

### O que ainda não foi provado contra produção

Tudo abaixo passa em teste e compila; o que falta é uma volta completa com dado de verdade:

- [ ] Gerar um link num cliente real e abrir o WhatsApp
- [ ] O gestor preencher e enviar pelo celular
- [ ] O upload da planilha pelo link (grava com a chave de administração — caminho novo no Storage)
- [ ] A conferência cruzada com uma planilha real

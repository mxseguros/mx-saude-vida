# MX SaúdeVida — plano v3, para aprovação

**05/10/2026** · No ar: https://mx-saudevida.vercel.app · 354 testes · 177 clientes carregados

Este plano substitui o v2. Mudou uma coisa: **a Sprint 6 (apólice por IA) vai para o fim da fila**, por decisão do Gabriel. O agente já está pronto e provado; o que falta dela são tela e configurações, e isso espera.

---

## 1. O que mudou desde o v2

| | |
|---|---|
| ✅ | Vistas **Mês e Semana** do Controle |
| ✅ | **Retenção LGPD** — prazos em tabela, cron apaga o que venceu |
| ✅ | **Backup com restauração provada** — 11 tabelas, 5 views, 42 políticas de RLS conferidas |
| ✅ | **Agente da apólice** — lê as três apólices reais com 8+ campos certos cada |
| 🅿️ | Tela e configurações da apólice → **fim da fila** |

---

## 2. As três lacunas que achei conferindo o código

Não estavam em plano nenhum. Achei agora, e **a primeira é séria**.

### 2.1 O Controle não tem busca nem filtro — e tem 177 linhas

A tela de **Clientes** tem busca. O **Controle** não tem nada: nem buscar por segurado ou CNPJ, nem filtrar por seguradora, situação ou analista. São 177 linhas numa tabela, e a analista rola até achar.

O protótipo v0.8 prevê a barra inteira: `🔍 Segurado ou CNPJ · Cia · Status · Analista`. Ela não foi construída.

**É o maior problema de uso do sistema hoje**, e piora a cada cliente novo.

### 2.2 Não existe modelo de planilha

O protótipo tem **Configurações › Modelo**, de onde a MX sobe o xlsx que o cliente baixa. Não existe — nem a aba, nem o botão de baixar no portal. Hoje o cliente manda o arquivo que quiser, e a conferência vira adivinhação de cabeçalho.

### 2.3 Todo mês está sem analista

`analyst_id` fica em `monthly_controls` e nunca é preenchido. As vistas Mês e Semana mostram "sem analista" em tudo, e o filtro por analista do protótipo não teria o que filtrar.

O v0.7 põe o analista no **cliente**, não no mês — e faz sentido: ninguém quer reatribuir 177 clientes a cada competência.

---

## 3. As entregas, em ordem

### Fase A — Usabilidade do Controle *(~2 dias)*

Depois de 177 clientes, a tela precisa ser navegável.

- [ ] **A.1** Busca por segurado ou CNPJ, na URL (`?q=`), com os acentos normalizados
- [ ] **A.2** Filtros: Seguradora · Situação (etapa) · Analista · Produto
- [ ] **A.3** Os filtros valem nas **três vistas** — Lista, Mês e Semana
- [ ] **A.4** Os quatro contadores passam a refletir o filtro, e a tela diz "mostrando N de 177"
- [ ] **A.5** Um botão "limpar filtros" quando houver algum

**Aceite:** a analista digita três letras do nome e acha o cliente, em qualquer vista.

### Fase B — Analista responsável *(~1 dia)*

- [ ] **B.1** Migration: `analyst_id` em `clients`
- [ ] **B.2** Campo "Analista responsável" no cadastro do cliente
- [ ] **B.3** Atribuição em lote na lista de Clientes (marcar vários → atribuir)
- [ ] **B.4** O mês herda o analista do cliente ao abrir
- [ ] **B.5** Filtro por analista passa a funcionar de verdade

**Aceite:** a analista filtra o Controle pelos clientes dela e vê só os seus.

**Depende de você:** quem são as analistas, e quem cuida de quem. Sem isso eu entrego o campo vazio.

### Fase C — Modelo de planilha *(~1,5 dia)*

- [ ] **C.1** Configurações › aba **Modelo**: subir o xlsx, ver qual está no ar, trocar
- [ ] **C.2** Botão "Baixar o modelo" na etapa 2 do portal
- [ ] **C.3** A tela de conferir passa a comparar o cabeçalho recebido com o do modelo e apontar coluna faltando
- [ ] **C.4** Guardado no bucket, como os outros arquivos

**Depende de você:** o xlsx do modelo. Se não tiver, eu gero um a partir das colunas que o parser já reconhece.

### Fase D — Fechar a Sprint 5 *(~1,5 dia)*

- [ ] **D.1** Provas Playwright contra **produção**, com acesso descartável criado e apagado na prova
- [ ] **D.2** Base sintética no `seed.sql` — 30 clientes, para o banco de ensaio não depender da carga real
- [ ] **D.3** Subir as actions do GitHub que ainda miram Node 20

### Fase E — Paralelo com o Excel *(duas competências)*

Portão G2. **Não é código.**

- [ ] **E.1** Rodar novembro e dezembro nos dois
- [ ] **E.2** Conferir totais, datas e avisos ao fim de cada mês
- [ ] **E.3** Corrigir as divergências

### Fase F — Virada *(~1 semana)*

- [ ] **F.1** `ensaio_zerar()` e carga definitiva
- [ ] **F.2** Acessos dos clientes por ondas: 10 → 30 → todos
- [ ] **F.3** Treinamento de 1 h
- [ ] **F.4** Excel congelado

### Fase G — Apólice por IA 🅿️ *(fim da fila, ~2,5 dias)*

O agente está pronto e provado. Falta a tela.

- [ ] **G.1** Rota que sobe o PDF, lê e devolve proposta sem gravar
- [ ] **G.2** Seção "Apólice" na ficha, campos propostos destacados
- [ ] **G.3** Cartão "Contrato" do portal mostrando capital e vigência
- [ ] **G.4** Configurações › Agente da apólice: prompt versionado e custo do mês

---

## 4. O que depende de você, e não de mim

Nada disso é código, e **é o que separa o sistema de estar em uso**.

- [ ] **1. E-mail** (Graph ou Resend) — sem isso **nenhuma mensagem sai**. É o canal de 169 dos 177 clientes
- [ ] **2. Os 86 clientes sem contato** — sem e-mail nem celular do gestor, não podem ser avisados
- [ ] **3. Quem é a analista de cada cliente** — bloqueia a Fase B
- [ ] **4. O xlsx do modelo de planilha** — bloqueia parte da Fase C
- [ ] **5. `SUPABASE_AUTH_HOOK_SECRET`** — para "Esqueci a senha" do portal funcionar
- [ ] **6. Conferir o limite de idade da Prudential** — o agente leu **74**, a memória do projeto registra **70**

---

## 5. Minha recomendação de ordem

```
A  Busca e filtros no Controle   ← maior ganho, não depende de você
B  Analista por cliente          ← precisa do item 3
C  Modelo de planilha            ← precisa do item 4 (ou eu gero)
D  Fechar a Sprint 5
E  Paralelo nov + dez
F  Virada
G  Apólice por IA 🅿️
```

Começo pela **A** porque é a única que não espera nada e é a que a analista sente no primeiro minuto. As fases B e C podem trocar de lugar conforme o que você me passar primeiro.

---

## 6. Riscos

| Risco | Mitigação |
|---|---|
| Ligar o e-mail antes de revisar os 86 contatos | Revisar primeiro; tudo fica registrado em `messages` para auditar |
| Filtro na URL virar link quebrado | Valor estranho cai no padrão, como já é com `?vista=` |
| Modelo de planilha engessar o cliente | A conferência **aponta** coluna faltando, não recusa o arquivo |
| Grupos com vários CNPJs (Rofatto 13, Casa de Sucos 7) | A tela avisa quantas abas achou; a conciliação segue fora do escopo |

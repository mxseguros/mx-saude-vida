# Sprint 6 — Leitura da apólice por IA

**Entrega:** a analista sobe o PDF da apólice e os campos chegam preenchidos para ela revisar.
**Protótipo:** v0.8, aba "Cadastro e apólice" da ficha do cliente.
**Chave:** a mesma do MX Sinistro, já copiada para `apps/web/.env.local` (05/10).

---

## 1. Por que esta sprint, e por que agora

São **177 clientes** carregados do CONTROLE FATURAS e **nenhuma apólice cadastrada**. A planilha não trazia número de apólice, capital, taxa nem vigência — nada disso existe no sistema hoje.

Cadastrar à mão significa, por cliente: abrir o PDF, achar o número da apólice, o capital (que às vezes é escalonado por cargo), a taxa por mil, o limite de idade e a vigência. São seis campos espalhados num documento de dezenas de páginas, 177 vezes. **Semanas de digitação.**

Duas coisas dependem disso:

- O cartão **"Contrato"** do portal do cliente está vazio. É o que responde "o que eu tenho contratado?" sem telefonar.
- A conferência da planilha hoje não tem contra o que comparar. Com o capital por cargo cadastrado, o sistema pode apontar a linha cujo capital não bate com a regra da apólice.

---

## 2. O que já está pronto no banco

Nada de migration nesta sprint — a Sprint 1 deixou o schema de pé:

| Tabela | Para quê |
|---|---|
| `policies` | `policy_number`, `contract_number`, `product_name`, `valid_from`, `valid_to`, `capital_rule` (jsonb), `rate_per_mille`, `age_limit`, `pdf_file_id`, `extracted_by_ai_run` |
| `ai_prompts` | prompt versionado, no máximo um ativo por agente |
| `ai_runs` | livro-caixa: tokens, custo em real, `content_hash`, `output`, `accepted` |

E `client_files` já aceita `kind = 'policy'`, com a política de RLS que impede o cliente de subir apólice — só a equipe anexa.

---

## 3. O que vem do MX Sinistro, e o que é novo

**Copiar quase como está** (`MX Sinistro/apps/web/lib/ia/`):

| Arquivo | Linhas | Adaptação |
|---|---|---|
| `hash.ts` | 14 | nenhuma |
| `custo.ts` | 128 | nenhuma — tabela de preço por modelo e câmbio por `AI_USD_BRL` |
| `registro.ts` | 236 | trocar `ticket_id` por `client_id` em `ai_runs` |
| `prompts.ts` | 100 | um agente só: `apolice` |

**Reescrever:** `apolice.ts` (464 linhas no Sinistro). A mecânica serve — primeiras páginas do PDF, chamada ao Haiku, validação por zod, cache por hash, teto diário. **O esquema é outro:** o do Sinistro é de Auto (placa, chassi, FIPE, franquia); o nosso é de vida e saúde.

---

## 4. O esquema de extração

```ts
export const esquemaApolice = z.object({
  numeroApolice: z.string().nullable(),
  numeroContrato: z.string().nullable(),
  seguradora: z.string().nullable(),
  produto: z.string().nullable(),            // "VG Express", "Saúde Empresarial"
  segurado: z.string().nullable(),           // confere com o cadastro
  documentoSegurado: z.string().nullable(),  // confere com o CNPJ
  vigenciaInicio: z.string().nullable(),     // ISO
  vigenciaFim: z.string().nullable(),
  taxaPorMil: z.number().nullable(),         // 1.339977 na Prudential da Artgraf
  limiteDeIdade: z.number().int().nullable(),
  capital: z.discriminatedUnion("tipo", [
    z.object({ tipo: z.literal("por_cargo"), faixas: z.array(
      z.object({ rotulo: z.string(), capital: z.number() })
    )}),
    z.object({ tipo: z.literal("per_capita"), valor: z.number() }),
    z.object({ tipo: z.literal("multiplo_salarial"), multiplo: z.number() }),
    z.object({ tipo: z.literal("nao_consta") }),
  ]),
  confianca: z.record(z.string(), z.number().min(0).max(1)),
  ilegivel: z.array(z.string()),
});
```

**`capital` é união discriminada, e isso é o ponto delicado.** A Prudential da Artgraf tem capital **por cargo** (Funcionário R$ 23.103,62, Sócio R$ 173.277,15); outras apólices usam **per capita** ou **múltiplo salarial**. Um campo `capital: number` forçaria o modelo a escolher um dos dois valores da Artgraf e jogar o outro fora — e aí a conferência da planilha compararia contra o número errado. `nao_consta` existe para o modelo poder dizer que não achou, em vez de inventar.

**`confianca` por campo** é o que decide o destaque na tela. **`ilegivel`** é o que o modelo não conseguiu ler e por quê — e é o que evita a analista procurar um campo que o PDF não tem.

---

## 5. As entregas

| # | Item | Dias |
|---|---|---|
| 6.1 | `lib/ia/{hash,custo,registro,prompts}.ts` copiados e adaptados | 0,5 |
| 6.2 | `lib/ia/apolice.ts` com o esquema acima, cache por hash e teto diário | 1 |
| 6.3 | `POST /api/v1/clientes/[id]/apolice` — sobe o PDF, lê, devolve proposta **sem gravar** | 0,5 |
| 6.4 | Seção "Apólice" na ficha do cliente: upload, campos propostos **destacados**, revisão e salvar | 1 |
| 6.5 | Cartão "Contrato" do portal passa a mostrar capital e taxa | 0,25 |
| 6.6 | Configurações › aba "Agente da apólice": prompt versionado, histórico de execuções, custo do mês | 0,75 |
| 6.7 | Testes do esquema e do mapeamento (sem chamar o modelo) | 0,5 |

**Total: ~4,5 dias.**

### As duas regras que atravessam tudo

**A IA PROPÕE, o código decide.** Nada é gravado sem a analista confirmar. O campo preenchido pelo modelo fica **destacado** até ela revisar — é a regra 12 do `CLAUDE.md`, e aqui ela tem consequência: capital errado no cadastro vira conferência de planilha errada todo mês.

**Ler e gravar são chamadas separadas**, como no boleto. O `POST` sobe e lê; o salvar é o formulário normal de cliente. Entre os dois, ela corrige.

---

## 6. O controle de custo

O Sinistro já resolveu isso e o código vem junto:

- **Cache por hash do conteúdo.** A mesma apólice não é paga duas vezes — e reenvio do mesmo PDF é comum quando a analista troca de aba.
- **Teto diário por perfil**, em `ai_runs`. Estouro responde 429 com a mensagem certa, não um erro genérico.
- **`ai_runs` como livro-caixa:** tokens de entrada e saída, modelo, custo em real pelo `AI_USD_BRL`.
- **Só as primeiras 20 páginas** vão ao modelo. Apólice tem dezenas de páginas de condições gerais que não mudam nada e custariam em token.

Estimativa: Haiku a ~US$ 1/1M tokens de entrada, ~15k tokens por apólice de 20 páginas. **177 apólices ≈ US$ 3.** O teto existe para erro de laço, não para economia.

---

## 7. Aceite

1. A **Prudential da Artgraf** (`Docs/Prudential - Apólice.PDF`) é lida com **pelo menos 7 campos certos**, incluindo o capital por cargo com as duas faixas e a taxa 1,339977‰.
2. Duas apólices de **outras seguradoras** são lidas sem o esquema quebrar — mesmo que com campos nulos.
3. PDF digitalizado sem camada de texto responde "preencha à mão", sem derrubar a rota.
4. A mesma apólice enviada duas vezes **não gera duas execuções** em `ai_runs`.
5. Nenhum campo vai para `policies` sem a analista salvar.
6. O cartão "Contrato" do portal mostra apólice, vigência e capital.

---

## 8. O que preciso de você

| # | O quê | Quando |
|---|---|---|
| 1 | **`ANTHROPIC_API_KEY` na Vercel** (Production) | antes de testar em produção |
| 2 | **Duas apólices em PDF** de seguradoras diferentes da Prudential | para o aceite nº 2 |
| 3 | `AI_USD_BRL` na Vercel, se quiser o custo em real exato | opcional, o padrão é 5,50 |

A chave já está no `.env.local` local, então **começo sem esperar** — o item 1 só é necessário quando a leitura for rodar no ar.

---

## 9. O que esta sprint NÃO faz

| Item | Por quê |
|---|---|
| **De/Para da planilha contra a base** | Precisa da tabela de funcionários, que saiu na simplificação v0.8 |
| **Conferir capital da planilha contra a apólice** | Fica para depois, e só faz sentido com o capital cadastrado — que é o que esta sprint entrega |
| **Triagem ou outro agente** | Um agente só. O plano reserva a IA para a apólice |
| **Leitura em lote das 177** | A analista sobe uma por vez, revisando. Lote de 177 sem revisão é 177 cadastros errados de uma vez |

---

## 10. Ordem dentro da sprint

```
6.1 → 6.2 → 6.7   as três primeiras são código puro, testável sem a tela
6.3 → 6.4         a rota e a tela, que é onde a analista vê
6.5 → 6.6         portal e configurações, que dependem do que já estiver gravando
```

Começo pela 6.2 depois da 6.1: o esquema e o mapeamento são onde o erro custa caro, e são testáveis contra a Prudential real sem gastar um token.

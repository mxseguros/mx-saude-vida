import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";

import { registrarLog } from "../log";
import { PROMPTS_PADRAO } from "./prompts";

/**
 * Leitura da apólice pelo modelo.
 *
 * **A IA PROPÕE, o código decide.** Nada aqui grava: o resultado volta para a
 * tela, a analista revisa e só então salva. Capital errado no cadastro vira
 * conferência de planilha errada todo mês, e nenhum extrator merece essa
 * confiança sozinho.
 *
 * As TRÊS apólices reais que temos mostram por que o esquema é como é:
 *
 * | documento              | páginas | capital        | taxa | limite de idade |
 * |------------------------|---------|----------------|------|-----------------|
 * | Prudential (em grupo)  | 27      | por CARGO      | sim  | sim             |
 * | Tokio                  | 9       | por cobertura  | não  | não             |
 * | Porto (individual)     | 4       | por COBERTURA  | não  | não             |
 *
 * Um campo `capital: number` forçaria o modelo a escolher um dos dois valores
 * da Prudential e jogar o outro fora — e a conferência da planilha compararia
 * contra o número errado, todo mês. Daí a união discriminada.
 *
 * NÃO HÁ campo de confiança. Ele existia no desenho e saiu depois da primeira
 * leitura real: o modelo devolveu `{}` nas três apólices, porque nada no
 * esquema o obriga a preencher um objeto de chaves livres. Campo que sempre
 * volta vazio é campo que mente para quem lê o código.
 *
 * O destaque na tela sai de outra coisa, mais simples e verdadeira: **campo não
 * nulo foi o modelo que preencheu**, e fica destacado até a analista salvar.
 */

/**
 * Haiku 4.5: no MX Sinistro acertou os mesmos 14 de 15 campos que o Opus por um
 * quinto do preço, e sem raciocínio. A apólice é documento estruturado; o
 * trabalho é achar e copiar, não deduzir.
 */
const MODELO = "claude-haiku-4-5-20251001";

/** 32 MB é o limite da requisição; a apólice típica tem 0,1 a 1 MB. */
const TAMANHO_MAXIMO = 30 * 1024 * 1024;

/**
 * Quantas páginas vão ao modelo.
 *
 * A Prudential tem 27 páginas e as últimas são condições gerais — texto igual
 * em toda apólice daquela seguradora, que não muda nada e custaria em token. O
 * que interessa (apólice, vigência, capital, taxa) está sempre nas primeiras.
 */
export const PAGINAS_LIDAS = 12;

export async function primeirasPaginas(pdf: Buffer, quantas = PAGINAS_LIDAS): Promise<Buffer> {
  try {
    const original = await PDFDocument.load(pdf, { ignoreEncryption: true });
    const total = original.getPageCount();
    if (total <= quantas) return pdf;

    const cortado = await PDFDocument.create();
    const paginas = await cortado.copyPages(original, Array.from({ length: quantas }, (_, i) => i));
    for (const pagina of paginas) cortado.addPage(pagina);
    return Buffer.from(await cortado.save());
  } catch {
    // PDF que o pdf-lib não abre segue inteiro: o modelo talvez leia, e
    // recusar aqui seria desistir antes de tentar.
    return pdf;
  }
}

/* --------------------------------------------------------------------------
   O esquema
   -------------------------------------------------------------------------- */

const faixa = z.object({
  /** "Funcionário", "Sócio", "Morte", "Morte Acidental". */
  rotulo: z.string(),
  capital: z.number().nonnegative(),
});

/**
 * As quatro formas de capital que as apólices reais usam.
 *
 * `nao_consta` existe para o modelo poder dizer que não achou, em vez de
 * escolher a forma menos errada e inventar um número.
 */
export const esquemaCapital = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("por_cargo"), faixas: z.array(faixa).min(1) }),
  z.object({ tipo: z.literal("por_cobertura"), faixas: z.array(faixa).min(1) }),
  z.object({ tipo: z.literal("per_capita"), valor: z.number().nonnegative() }),
  z.object({ tipo: z.literal("multiplo_salarial"), multiplo: z.number().positive() }),
  z.object({ tipo: z.literal("nao_consta") }),
]);

export type Capital = z.infer<typeof esquemaCapital>;

export const esquemaApolice = z.object({
  numeroApolice: z.string().nullable(),
  numeroContrato: z.string().nullable(),
  seguradora: z.string().nullable(),
  /** "VG Express", "Vida Individual", "Saúde Empresarial". */
  produto: z.string().nullable(),
  segurado: z.string().nullable(),
  /** CNPJ ou CPF, como está escrito no documento. */
  documentoSegurado: z.string().nullable(),
  vigenciaInicio: z.string().nullable(),
  vigenciaFim: z.string().nullable(),
  /** Só algumas apólices têm. 1.339977 na Prudential. */
  taxaPorMil: z.number().nullable(),
  /** Idade máxima de permanência. A Tokio e a Porto não trazem. */
  limiteDeIdade: z.number().int().nullable(),
  capital: esquemaCapital,
  /**
   * O que o modelo procurou e não conseguiu ler, e por quê.
   *
   * Isto ele preenche: na Tokio devolveu "taxa por mil - não consta" e "limite
   * de idade - não consta". É o que evita a analista procurar no PDF um campo
   * que o PDF não tem.
   */
  ilegivel: z.array(z.string()),
});

export type Apolice = z.infer<typeof esquemaApolice>;

/**
 * O guia dos campos.
 *
 * Vai no turno do USUÁRIO, não no prompt do sistema: o prompt é o texto que o
 * administrador edita em Configurações, e o guia é contrato de código — ele
 * muda junto com o zod acima. Misturar os dois faria uma edição na tela
 * quebrar a validação.
 */
const GUIA_DOS_CAMPOS = `Campos, e o que cada um quer dizer:

- numeroApolice: o número da apólice, como está escrito (ex.: "26.1391.2239194", "1099300020949/1").
- numeroContrato: o número do contrato ou da proposta, quando existir separado da apólice.
- seguradora: o nome da companhia que EMITE a apólice.
- produto: o nome comercial do plano (ex.: "Vida Individual", "VG Express").
- segurado: a empresa estipulante, ou a pessoa, conforme o caso.
- documentoSegurado: o CNPJ ou CPF do segurado. NUNCA o da seguradora nem o da corretora.
- vigenciaInicio / vigenciaFim: AAAA-MM-DD.
- taxaPorMil: número, se a apólice trouxer taxa por mil. Senão null.
- limiteDeIdade: idade máxima de permanência. Senão null.
- capital: escolha UMA das formas descritas nas regras.
- ilegivel: lista do que procurou e não achou.`;

/**
 * O MESMO esquema, em JSON Schema, para a saída estruturada.
 *
 * Duplicar o zod aqui incomoda. A alternativa — `zodOutputFormat`, que deriva o
 * JSON Schema do próprio zod — exige **zod v4**, e este projeto está no v3 em
 * todos os outros esquemas (cliente, planilha, boleto). Migrar o zod inteiro
 * por causa deste arquivo seria mexer em tudo o que já está validando
 * cadastro em produção.
 *
 * Então: a API garante a FORMA pelo JSON Schema, e o zod garante o CONTEÚDO
 * depois (faixa de 0 a 1 na confiança, número não negativo no capital). Se um
 * dia o projeto subir para zod v4, isto vira uma linha.
 *
 * UMA ARMADILHA, achada na primeira chamada real: o discriminador vai como
 * `{ type: "string", enum: ["por_cargo"] }`, e NÃO como `{ const: "por_cargo" }`.
 * A API recusa `const` sozinho com "JSON schema must have a type defined if
 * anyOf/oneOf/allOf are not used" — e o erro aponta para o `anyOf`, não para o
 * `const`, o que custou uma bissecção para achar.
 */
const faixaJson = {
  type: "object",
  additionalProperties: false,
  required: ["rotulo", "capital"],
  properties: { rotulo: { type: "string" }, capital: { type: "number" } },
} as const;

const FORMATO = {
  type: "object",
  additionalProperties: false,
  required: [
    "numeroApolice",
    "numeroContrato",
    "seguradora",
    "produto",
    "segurado",
    "documentoSegurado",
    "vigenciaInicio",
    "vigenciaFim",
    "taxaPorMil",
    "limiteDeIdade",
    "capital",
    "ilegivel",
  ],
  properties: {
    numeroApolice: { type: ["string", "null"] },
    numeroContrato: { type: ["string", "null"] },
    seguradora: { type: ["string", "null"] },
    produto: { type: ["string", "null"] },
    segurado: { type: ["string", "null"] },
    documentoSegurado: { type: ["string", "null"] },
    vigenciaInicio: { type: ["string", "null"], description: "AAAA-MM-DD" },
    vigenciaFim: { type: ["string", "null"], description: "AAAA-MM-DD" },
    taxaPorMil: { type: ["number", "null"] },
    limiteDeIdade: { type: ["integer", "null"] },
    capital: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["tipo", "faixas"],
          properties: { tipo: { type: "string", enum: ["por_cargo"] }, faixas: { type: "array", items: faixaJson } },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["tipo", "faixas"],
          properties: { tipo: { type: "string", enum: ["por_cobertura"] }, faixas: { type: "array", items: faixaJson } },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["tipo", "valor"],
          properties: { tipo: { type: "string", enum: ["per_capita"] }, valor: { type: "number" } },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["tipo", "multiplo"],
          properties: { tipo: { type: "string", enum: ["multiplo_salarial"] }, multiplo: { type: "number" } },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["tipo"],
          properties: { tipo: { type: "string", enum: ["nao_consta"] } },
        },
      ],
    },
    ilegivel: { type: "array", items: { type: "string" } },
  },
} as const;


export type ResultadoDaLeitura =
  | { ok: true; dados: Apolice; uso: { entrada: number; saida: number }; modelo: string }
  | { ok: false; codigo: string; mensagem: string };

/* --------------------------------------------------------------------------
   A leitura
   -------------------------------------------------------------------------- */

/**
 * Nunca lança.
 *
 * PDF protegido, digitalizado sem texto, chave ausente, limite da API — tudo
 * vira uma resposta com mensagem em português. Derrubar a rota faria a analista
 * achar que o sistema está fora do ar quando o problema é um arquivo.
 */
export async function lerApolice(pdf: Buffer, prompt: string = PROMPTS_PADRAO.apolice): Promise<ResultadoDaLeitura> {
  if (pdf.byteLength > TAMANHO_MAXIMO) {
    return {
      ok: false,
      codigo: "pdf_grande",
      mensagem: "A apólice é grande demais para leitura automática. Preencha os campos à mão.",
    };
  }

  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave) {
    return {
      ok: false,
      codigo: "sem_chave",
      mensagem: "A leitura automática não está configurada. Preencha os campos à mão.",
    };
  }

  try {
    const lido = await primeirasPaginas(pdf);
    const cliente = new Anthropic({ apiKey: chave });

    // `messages.parse` com `zodOutputFormat` OBRIGA a forma da resposta a partir
    // do MESMO zod que valida depois — uma fonte só. Sem isto o modelo escolhe os
    // nomes dos campos: na primeira prova ele devolveu `numero_apolice`,
    // `vigencia` como objeto e `capital_forma`. Tudo plausível, nada que o
    // esquema aceitasse.
    //
    // Pedir "devolva este formato" por texto não basta; a saída estruturada é
    // o que obriga.
    const resposta = await cliente.messages.parse({
      model: MODELO,
      max_tokens: 4000,
      system: prompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: lido.toString("base64") },
            },
            {
              type: "text",
              text: ["Extraia os dados desta apólice.", GUIA_DOS_CAMPOS].join("\n\n"),
            },
          ],
        },
      ],
      output_config: { format: jsonSchemaOutputFormat(FORMATO) },
    });

    // `parsed_output` vem nulo quando a resposta não casou com a FORMA.
    if (!resposta.parsed_output) {
      registrarLog("erro", "ia.apolice_formato", { parada: resposta.stop_reason ?? "desconhecida" });
      return {
        ok: false,
        codigo: "formato_inesperado",
        mensagem: "A leitura automática devolveu um formato inesperado. Preencha os campos à mão.",
      };
    }

    // A forma veio certa; o zod confere o CONTEÚDO — confiança entre 0 e 1,
    // capital não negativo, faixa com pelo menos um item.
    const analise = esquemaApolice.safeParse(resposta.parsed_output);
    if (!analise.success) {
      registrarLog("erro", "ia.apolice_conteudo", {
        campos: analise.error.issues.slice(0, 5).map((i) => i.path.join(".")).join(", "),
      });
      return {
        ok: false,
        codigo: "conteudo_invalido",
        mensagem: "A leitura automática devolveu valores fora do esperado. Confira os campos à mão.",
      };
    }

    return {
      ok: true,
      dados: analise.data,
      uso: { entrada: resposta.usage.input_tokens, saida: resposta.usage.output_tokens },
      modelo: resposta.model,
    };
  } catch (erro) {
    // O que deu errado vai para o log, SEM a chave e sem o conteúdo do PDF.
    const e = erro as { name?: string; status?: number };
    registrarLog("erro", "ia.apolice_falhou", { nome: e?.name ?? "Erro", status: e?.status ?? null });

    return {
      ok: false,
      codigo: "falhou",
      mensagem: "Não consegui ler a apólice agora. Tente de novo ou preencha os campos à mão.",
    };
  }
}


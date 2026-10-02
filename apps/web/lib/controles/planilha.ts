import "server-only";

import ExcelJS from "exceljs";

import { lerPlanilha, type Celula, type Planilha } from "../dominio/planilha";
import { registrarLog } from "../log";

/**
 * Abre o xlsx e entrega a matriz de células ao parser puro.
 *
 * Só I/O. A interpretação — achar o cabeçalho, validar CPF, apontar campo em
 * branco — é de `lib/dominio/planilha.ts`, que tem teste e não sabe o que é um
 * arquivo.
 *
 * ExcelJS e não SheetJS: o pacote `xlsx` do npm está parado na 0.18.5 com
 * alerta de severidade ALTA, e o CI roda `pnpm audit --prod --audit-level high`.
 * O plano pedia SheetJS; o portão de segurança vence o plano.
 */

/** Teto de linhas lidas. A planilha real tem 1.041 linhas e 104 vidas. */
const LINHAS_DEMAIS = 5000;

export type LeituraDaPlanilha =
  | { ok: true; planilha: Planilha; aba: string; abas: string[] }
  | { ok: false; motivo: string };

export async function lerArquivoDaPlanilha(arquivo: File): Promise<LeituraDaPlanilha> {
  try {
    const livro = new ExcelJS.Workbook();
    const bytes = await arquivo.arrayBuffer();

    const nome = arquivo.name.toLowerCase();
    if (nome.endsWith(".csv")) {
      // O CSV do cliente vem em UTF-8 ou em ANSI do Excel brasileiro. ExcelJS
      // lê o buffer; acento torto é problema de exibição, não de leitura.
      const texto = new TextDecoder("utf-8").decode(bytes);
      const linhas = texto
        .split(/\r?\n/)
        .slice(0, LINHAS_DEMAIS)
        .map((linha) => separarCsv(linha) as Celula[]);

      return { ok: true, planilha: lerPlanilha(linhas), aba: "CSV", abas: ["CSV"] };
    }

    await livro.xlsx.load(bytes);

    const abas = livro.worksheets.map((a) => a.name);
    // A PRIMEIRA aba. Planilha com várias (a Rede Rofatto tem 13, uma por CNPJ)
    // é caso da conciliação, que não é desta sprint — a tela diz quantas abas
    // achou para a analista saber que tem mais.
    const aba = livro.worksheets[0];
    if (!aba) return { ok: false, motivo: "Este arquivo não tem nenhuma aba com dados." };

    const matriz: Celula[][] = [];
    aba.eachRow({ includeEmpty: true }, (linha, numero) => {
      if (numero > LINHAS_DEMAIS) return;

      const celulas: Celula[] = [];
      // `linha.values` começa no índice 1; o índice 0 vem vazio.
      const valores = linha.values as unknown[];
      for (let i = 1; i < valores.length; i += 1) {
        celulas.push(normalizar(valores[i]));
      }
      matriz.push(celulas);
    });

    return { ok: true, planilha: lerPlanilha(matriz), aba: aba.name, abas };
  } catch (erro) {
    // O log leva o tipo, nunca o conteúdo: a planilha tem nome e CPF de cada
    // funcionário do cliente.
    registrarLog("erro", "planilha.leitura", {
      codigo: erro instanceof Error ? erro.name : "desconhecido",
    });
    return {
      ok: false,
      motivo: "Não consegui abrir este arquivo. Confira se é um xlsx, xls ou csv válido.",
    };
  }
}

/**
 * O que o ExcelJS devolve numa célula não é só texto e número.
 *
 * Fórmula vem como `{ result }`, texto formatado como `{ richText }`, link como
 * `{ text, hyperlink }`. Sem desembrulhar, o parser receberia `[object Object]`
 * no lugar do nome do funcionário.
 */
function normalizar(valor: unknown): Celula {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "string" || typeof valor === "number") return valor;
  if (valor instanceof Date) return valor;

  if (typeof valor === "object") {
    const objeto = valor as Record<string, unknown>;

    if (Array.isArray(objeto.richText)) {
      return objeto.richText.map((parte) => String((parte as { text?: string }).text ?? "")).join("");
    }
    if ("result" in objeto) return normalizar(objeto.result);
    if ("text" in objeto) return String(objeto.text);
    if ("error" in objeto) return null;
  }

  return String(valor);
}

/**
 * Uma linha de CSV, respeitando aspas.
 *
 * Nome com vírgula dentro — "Silva, Maria José" — é comum em exportação de
 * folha, e cortar no separador cru partiria a pessoa em duas colunas.
 */
function separarCsv(linha: string): string[] {
  const separador = (linha.match(/;/g)?.length ?? 0) > (linha.match(/,/g)?.length ?? 0) ? ";" : ",";
  const campos: string[] = [];
  let atual = "";
  let dentroDeAspas = false;

  for (let i = 0; i < linha.length; i += 1) {
    const c = linha[i];

    if (c === '"') {
      // `""` dentro de aspas é uma aspa literal.
      if (dentroDeAspas && linha[i + 1] === '"') {
        atual += '"';
        i += 1;
      } else {
        dentroDeAspas = !dentroDeAspas;
      }
      continue;
    }

    if (c === separador && !dentroDeAspas) {
      campos.push(atual.trim());
      atual = "";
      continue;
    }

    atual += c;
  }

  campos.push(atual.trim());
  return campos;
}

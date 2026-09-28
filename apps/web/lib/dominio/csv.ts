/**
 * Montagem de CSV para o Excel em português.
 *
 * Puro, e cada decisão aqui corrige um jeito específico de o arquivo chegar
 * quebrado na mesa de quem pediu.
 *
 * SEPARADOR PONTO-E-VÍRGULA. O Excel em português usa a vírgula como separador
 * decimal, então ele lê CSV separado por vírgula como uma coluna só. O arquivo
 * abre, não dá erro, e vem tudo espremido numa coluna — o modo de falhar que
 * parece sucesso.
 *
 * BOM DE UTF-8. Sem ele o Excel assume a codificação do sistema e "Assistência
 * Técnica" vira "AssistÃªncia TÃ©cnica". Também não dá erro.
 *
 * CRLF no fim da linha, que é o que o Excel espera no Windows.
 *
 * E o item que não é de formatação: **valor que começa com `=`, `+`, `-` ou
 * `@` é FÓRMULA para o Excel.** A base de clientes veio de planilha e tem nome
 * digitado por gente; um campo começando com `=` seria executado ao abrir o
 * arquivo. É injeção de fórmula em CSV, e a defesa é prefixar com apóstrofo —
 * que o Excel consome ao exibir, então a pessoa vê o texto original.
 */

const SEPARADOR = ";";
const FIM_DE_LINHA = "\r\n";
export const BOM = "﻿";

/** Caracteres que o Excel trata como início de fórmula. */
const INICIO_DE_FORMULA = /^[=+\-@\t\r]/;

export function escaparCelula(valor: unknown): string {
  if (valor === null || valor === undefined) return "";

  let texto = String(valor);

  // Neutraliza a fórmula ANTES de qualquer aspa: prefixar depois deixaria o
  // apóstrofo dentro do campo entre aspas e ele apareceria na célula.
  if (INICIO_DE_FORMULA.test(texto)) texto = `'${texto}`;

  // Aspas dobram; e o campo só precisa de aspas se contiver separador, aspas
  // ou quebra de linha. Envolver tudo em aspas funcionaria, mas deixa o
  // arquivo maior e ilegível quando alguém o abre num editor de texto.
  const precisaDeAspas =
    texto.includes(SEPARADOR) ||
    texto.includes('"') ||
    texto.includes("\n") ||
    texto.includes("\r");

  if (!precisaDeAspas) return texto;

  return `"${texto.replace(/"/g, '""')}"`;
}

/**
 * O arquivo inteiro, com BOM. O retorno já é o corpo da resposta.
 */
export function montarCsv(
  colunas: string[],
  linhas: readonly (readonly unknown[])[],
): string {
  const cabecalho = colunas.map(escaparCelula).join(SEPARADOR);
  const corpo = linhas.map((linha) => linha.map(escaparCelula).join(SEPARADOR));

  return BOM + [cabecalho, ...corpo].join(FIM_DE_LINHA) + FIM_DE_LINHA;
}

/**
 * Nome do arquivo, com a data no formato que ordena sozinho na pasta.
 *
 * `tickets-2026-09-05.csv` e não `tickets-05-09-2026.csv`: quem exporta toda
 * semana quer os arquivos em ordem cronológica ao listar o diretório.
 */
export function nomeDoArquivo(base: string, dia: string): string {
  const seguro = base.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  return `${seguro}-${dia.slice(0, 10)}.csv`;
}

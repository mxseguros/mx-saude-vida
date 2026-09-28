/**
 * CPF e CNPJ.
 *
 * No banco vive so o digito: `99900123425`. A mascara e da interface — e a
 * busca precisa achar o cliente tanto por "999.001.234-25" quanto por
 * "99900123425", porque a analista as vezes cola da apolice e as vezes digita.
 *
 * Puro, sem I/O.
 */

export type TipoDocumento = "cpf" | "cnpj" | null;

/** Deixa so os digitos. E a forma que vai para o banco. */
export function normalizarDocumento(valor: string): string {
  return valor.replace(/\D/g, "");
}

export function tipoDocumento(valor: string): TipoDocumento {
  // `limparDocumento` preserva letra: 11 posicoes so existem como CPF (e CPF
  // e sempre numerico), 14 podem ser o CNPJ alfanumerico. Para entrada so de
  // digitos o resultado e o mesmo de `normalizarDocumento`.
  const c = limparDocumento(valor);
  if (c.length === 11 && /^\d{11}$/.test(c)) return "cpf";
  if (c.length === 14) return "cnpj";
  return null;
}

/**
 * Para LISTAGEM: `99900123425` -> `***.001.234-**`, CNPJ -> `12.345.678/0001-**`.
 *
 * A tabela de clientes mostrava o documento inteiro de todo mundo, para
 * qualquer membro ativo, numa tela que fica aberta o dia todo. Os digitos do
 * meio bastam para conferir "e essa pessoa?"; o numero completo continua na
 * ficha e na busca — so a listagem em massa fica mascarada.
 */
export function mascararDocumento(valor: string): string {
  const d = limparDocumento(valor);
  if (tipoDocumento(valor) === "cpf") {
    return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
  }
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-**`;
  }
  return formatarDocumento(valor);
}

/** `99900123425` -> `999.001.234-25`. Devolve a entrada se nao reconhecer. */
export function formatarDocumento(valor: string): string {
  const d = limparDocumento(valor);

  if (tipoDocumento(valor) === "cpf") {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  return valor;
}

/**
 * Digito verificador, o mesmo algoritmo para CPF e CNPJ com pesos diferentes.
 *
 * Os pesos sao DERIVADOS do tamanho da entrada, nunca escritos a mao. No MX
 * Leads uma lista de pesos com um elemento a menos gerou documentos que
 * pareciam validos e nao eram — os dois digitos saiam iguais — e 965 registros
 * foram rejeitados na carga.
 */
export function digitoCpf(digitos: number[]): number {
  const peso = digitos.length + 1;
  const soma = digitos.reduce((acc, d, i) => acc + d * (peso - i), 0);
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

export function digitoCnpj(digitos: number[]): number {
  // Pesos ciclam 2..9 a partir da direita.
  const soma = digitos.reduce((acc, d, i) => {
    const peso = ((digitos.length - 1 - i) % 8) + 2;
    return acc + d * peso;
  }, 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cpfValido(valor: string): boolean {
  const d = normalizarDocumento(valor);
  if (d.length !== 11) return false;
  // Sequencias repetidas passam no calculo e nao existem na vida.
  if (/^(\d)\1{10}$/.test(d)) return false;

  const n = d.split("").map(Number);
  return digitoCpf(n.slice(0, 9)) === n[9] && digitoCpf(n.slice(0, 10)) === n[10];
}

/* --------------------------------------------------------------------------
   CNPJ alfanumerico (Receita, desde julho de 2026)
   -------------------------------------------------------------------------- */

/**
 * O documento sem pontuacao, em MAIUSCULAS e com as letras preservadas.
 *
 * Diferente de `normalizarDocumento`, que so deixa digito. As duas existem
 * porque servem a coisas diferentes: `clients.document` guarda digito, e a
 * busca por documento compara digito com digito; o CNPJ alfanumerico que a
 * Receita emite desde julho de 2026 tem letra nas doze primeiras posicoes e
 * precisa chegar inteiro ao calculo do verificador.
 */
export function limparDocumento(valor: string): string {
  return valor.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * O valor de um caractere no calculo do verificador: `'0'` vale 0 e `'A'`
 * vale 17, que e exatamente `charCodeAt - 48`. Para um CNPJ so de digitos o
 * resultado e o mesmo de antes — a regra alfanumerica GENERALIZA a antiga,
 * nao a substitui.
 */
function valorDoCaractere(caractere: string): number {
  return caractere.charCodeAt(0) - 48;
}

export function cnpjValido(valor: string): boolean {
  const c = limparDocumento(valor);
  // Os dois verificadores sao sempre numericos, mesmo no alfanumerico.
  if (!/^[A-Z0-9]{12}\d{2}$/.test(c)) return false;
  if (/^(.)\1{13}$/.test(c)) return false;

  const n = c.split("").map(valorDoCaractere);
  return (
    digitoCnpj(n.slice(0, 12)) === n[12] && digitoCnpj(n.slice(0, 13)) === n[13]
  );
}

export function documentoValido(valor: string): boolean {
  const tipo = tipoDocumento(valor);
  if (tipo === "cpf") return cpfValido(valor);
  if (tipo === "cnpj") return cnpjValido(valor);
  return false;
}

/**
 * O que a pessoa digitou na busca: um documento ou um nome?
 *
 * Decide qual coluna consultar. Digitar "390" nao e busca por documento — sao
 * tres digitos que tambem aparecem em nome de empresa; so trata como documento
 * a partir de um trecho que nao seria acidente.
 */
export function pareceDocumento(termo: string): boolean {
  const so = termo.replace(/[.\-/\s]/g, "");
  return /^\d{4,14}$/.test(so);
}

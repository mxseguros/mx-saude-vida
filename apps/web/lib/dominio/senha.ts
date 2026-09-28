/**
 * Senha de acesso definida pelo administrador (15/09).
 *
 * O convite por e-mail saiu: a equipe recebe a senha do administrador, em
 * mao, e entra com ela. Regra unica, valida no navegador e na rota: dez
 * caracteres ou mais, com letra e numero. Sem exigir simbolo — senha que a
 * pessoa nao consegue digitar no celular vira senha colada na tela.
 *
 * Puro. Testado.
 */

export const TAMANHO_MINIMO_DA_SENHA = 10;

export function problemaDaSenha(senha: string): string | null {
  if (senha.length < TAMANHO_MINIMO_DA_SENHA) {
    return `A senha precisa ter pelo menos ${TAMANHO_MINIMO_DA_SENHA} caracteres.`;
  }
  if (!/[A-Za-zÀ-ú]/.test(senha)) return "A senha precisa ter ao menos uma letra.";
  if (!/\d/.test(senha)) return "A senha precisa ter ao menos um número.";
  if (/\s/.test(senha)) return "A senha não pode ter espaço.";
  return null;
}

export function senhaValida(senha: string): boolean {
  return problemaDaSenha(senha) === null;
}

/**
 * Uma senha que da para ditar por telefone: sem 0/O, 1/l/I, e com ao menos
 * um numero garantido. `aleatorio` vem de fora para ser testavel.
 */
const LETRAS = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ";
const NUMEROS = "23456789";

export function gerarSenha(aleatorio: (limite: number) => number, tamanho = 12): string {
  const alfabeto = LETRAS + NUMEROS;
  const partes: string[] = [];
  for (let i = 0; i < tamanho; i++) partes.push(alfabeto[aleatorio(alfabeto.length)] ?? "a");
  // Garante letra e numero mesmo num sorteio azarado.
  partes[aleatorio(tamanho)] = LETRAS[aleatorio(LETRAS.length)] ?? "a";
  partes[aleatorio(tamanho)] = NUMEROS[aleatorio(NUMEROS.length)] ?? "7";
  const senha = partes.join("");
  return senhaValida(senha) ? senha : gerarSenha(aleatorio, tamanho);
}

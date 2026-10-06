/**
 * Busca por nome ou CNPJ, sem acento e sem caixa. Pura.
 *
 * "joao" acha "João"; "12.345" acha o CNPJ que tem esses dígitos. Termo vazio
 * acha tudo.
 */

export function semAcento(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function casaBusca(termo: string, alvo: { nomes: (string | null)[]; documento: string | null }): boolean {
  const t = semAcento(termo);
  if (!t) return true;
  if (alvo.nomes.some((n) => n && semAcento(n).includes(t))) return true;
  const digitos = termo.replace(/\D/g, "");
  return digitos.length >= 3 && (alvo.documento ?? "").replace(/\D/g, "").includes(digitos);
}

/** Ordem alfabética em português: "Água" antes de "Banco", sem caixa pesar. */
export function ordemAlfabetica<T>(lista: readonly T[], nome: (item: T) => string): T[] {
  return [...lista].sort((a, b) => nome(a).localeCompare(nome(b), "pt-BR", { sensitivity: "base" }));
}

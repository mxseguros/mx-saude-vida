/**
 * Telefone brasileiro — formatação para leitura.
 *
 * Puro: entra dígito, sai texto. O banco guarda só dígitos (`client_phones`),
 * porque máscara gravada é máscara que diverge — metade da base com parênteses
 * e metade sem, e a busca por telefone deixa de achar.
 *
 * Formata o que reconhece e **devolve o original quando não reconhece**. Um
 * número estrangeiro, um ramal ou uma linha com dígito a mais existem na base
 * de 8.762 titulares; recortá-los para caber num formato bonito inventaria um
 * telefone que ninguém atende.
 */

export function digitosDoTelefone(valor: string): string {
  return valor.replace(/\D/g, "");
}

export function formatarTelefone(valor: string | null | undefined): string {
  if (!valor) return "";

  const digitos = digitosDoTelefone(valor);

  // O "+" na frente é o discador dizendo o país. Se não for o Brasil, sair
  // formatando trata "+1 415 555 0134" — 11 dígitos, como um celular daqui —
  // como "(14) 15555-0134". Um número dos Estados Unidos remontado em São
  // Paulo: parece certo na tela e não completa a ligação.
  const declarouPais = valor.trim().startsWith("+");
  if (declarouPais && !digitos.startsWith("55")) return valor;

  // Com o 55 do Brasil na frente: tira, formata o resto e devolve com +55.
  if (digitos.length === 12 || digitos.length === 13) {
    if (digitos.startsWith("55")) {
      const semPais = formatarTelefone(digitos.slice(2));
      return semPais ? `+55 ${semPais}` : valor;
    }
  }

  // Celular com DDD: (11) 98765-4321
  if (digitos.length === 11) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
  }

  // Fixo com DDD: (11) 3456-7890
  if (digitos.length === 10) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  }

  // Sem DDD, 8 ou 9 dígitos: 98765-4321
  if (digitos.length === 9 || digitos.length === 8) {
    const corte = digitos.length - 4;
    return `${digitos.slice(0, corte)}-${digitos.slice(corte)}`;
  }

  return valor;
}

/**
 * Link de discagem. `tel:` com dígitos apenas — o formato com parênteses
 * funciona na maioria dos discadores e falha em alguns, e "a maioria" não é
 * bom o bastante para o telefone do segurado.
 */
export function linkTelefone(valor: string | null | undefined): string | null {
  const digitos = digitosDoTelefone(valor ?? "");
  if (digitos.length < 8) return null;
  return digitos.length >= 12 ? `tel:+${digitos}` : `tel:${digitos}`;
}

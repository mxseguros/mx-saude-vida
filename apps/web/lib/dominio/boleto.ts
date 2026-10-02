/**
 * Leitura do boleto. Puro: recebe o texto do PDF e devolve campos propostos.
 *
 * **O código PROPÕE, a analista decide.** Nada aqui grava: o resultado entra no
 * formulário já preenchido e ela confirma. Boleto com valor errado é cobrança
 * errada ao cliente, e nenhum extrator merece essa confiança sozinho.
 *
 * Sem modelo de linguagem, de propósito — a regra do projeto reserva a IA para
 * a apólice. Aqui os campos têm formato fechado e um deles, a linha digitável,
 * é conferível por dígito verificador. Onde dá para calcular, não se adivinha.
 */

export type CamposDoBoleto = {
  /** Em reais. Vem da linha digitável, que é imune ao leiaute do PDF. */
  valor: number | null;
  /** ISO `AAAA-MM-DD`. */
  vencimento: string | null;
  /** Número da parcela, como aparece no documento. */
  parcela: string | null;
  /** Os 47 dígitos, quando achados e válidos. */
  linhaDigitavel: string | null;
  /**
   * O que a tela precisa dizer à analista.
   *
   * `alta` = veio da linha digitável e o texto concorda. `media` = veio da
   * linha digitável e o texto não confirma, ou veio só do texto. `nenhuma` =
   * não achei; ela digita.
   */
  confianca: "alta" | "media" | "nenhuma";
  /** O que conferir, em português, quando a confiança não é alta. */
  avisos: string[];
};

/* --------------------------------------------------------------------------
   Linha digitável
   -------------------------------------------------------------------------- */

/**
 * O leiaute dos 47 dígitos (posições a partir de zero):
 *
 * ```
 * 0..2   banco           20      DV do campo 2
 * 3      moeda           21..30  campo 3
 * 4..8   campo 1         31      DV do campo 3
 * 9      DV do campo 1   32      DV GERAL
 * 10..19 campo 2         33..36  FATOR DE VENCIMENTO
 *                        37..46  VALOR, em centavos
 * ```
 *
 * O que interessa são os 14 últimos: fator e valor. Eles não dependem do banco
 * nem da carteira, e é por isso que ler daqui vale mais que caçar o rótulo
 * "Valor do Documento" no meio do texto.
 */
const DIGITOS_DA_LINHA = 47;

/** Acha uma linha digitável no texto, com ou sem a pontuação do papel. */
export function acharLinhaDigitavel(texto: string): string | null {
  // Com pontuação: 00000.00000 00000.000000 00000.000000 0 00000000000000
  const pontuada = texto.match(
    /\b\d{5}\.?\d{5}\s+\d{5}\.?\d{6}\s+\d{5}\.?\d{6}\s+\d\s+\d{14}\b/,
  );
  if (pontuada) {
    const digitos = somenteDigitos(pontuada[0]);
    if (digitos.length === DIGITOS_DA_LINHA && digitoGeralConfere(digitos)) return digitos;
  }

  // Corrida, como sai de alguns PDFs: 47 dígitos seguidos.
  for (const corrido of texto.match(/\d{47}/g) ?? []) {
    if (digitoGeralConfere(corrido)) return corrido;
  }

  return null;
}

function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

/**
 * Remonta o código de barras de 44 dígitos a partir da linha digitável.
 *
 * A linha digitável é o código de barras REEMBARALHADO para caber em quatro
 * blocos que uma pessoa consegue digitar. O dígito verificador geral é do
 * código de barras, não da linha — por isso conferir exige desembaralhar
 * primeiro.
 *
 * ```
 * barras:  banco+moeda(4) · DV(1) · fator+valor(14) · campo livre(25)
 * linha:   banco+moeda(4) · campo livre em 3 blocos com DV cada · DV(1) · fator+valor(14)
 * ```
 */
export function codigoDeBarras(linha: string): string | null {
  if (linha.length !== DIGITOS_DA_LINHA || !/^\d+$/.test(linha)) return null;

  const bancoMoeda = linha.slice(0, 4);
  const dvGeral = linha[32] as string;
  const fatorValor = linha.slice(33, 47);
  // Os três blocos, sem os dígitos verificadores de cada um.
  const campoLivre = linha.slice(4, 9) + linha.slice(10, 20) + linha.slice(21, 31);

  return bancoMoeda + dvGeral + fatorValor + campoLivre;
}

/**
 * O dígito verificador geral, por módulo 11.
 *
 * É o que separa "achei 47 dígitos" de "achei um boleto". Sem esta conferência,
 * qualquer sequência longa do PDF — um número de apólice, um protocolo — viraria
 * valor a cobrar do cliente.
 *
 * Pesos 2 a 9 girando da direita para a esquerda sobre os 43 dígitos do código
 * de barras (todos menos o próprio verificador). Pela regra da FEBRABAN,
 * resultado 0, 10 ou 11 vale 1.
 */
export function digitoGeralConfere(linha: string): boolean {
  const barras = codigoDeBarras(linha);
  if (!barras) return false;

  const informado = Number(barras[4]);
  const corpo = barras.slice(0, 4) + barras.slice(5);

  let soma = 0;
  let peso = 2;
  for (let i = corpo.length - 1; i >= 0; i -= 1) {
    soma += Number(corpo[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }

  const bruto = 11 - (soma % 11);
  const esperado = bruto === 0 || bruto === 10 || bruto === 11 ? 1 : bruto;

  return informado === esperado;
}

/** O valor, em reais, lido dos 10 últimos dígitos. `0` vira nulo: boleto em branco. */
export function valorDaLinha(linha: string): number | null {
  const centavos = Number(linha.slice(37, 47));
  if (!Number.isFinite(centavos) || centavos === 0) return null;
  return centavos / 100;
}

/**
 * O vencimento, a partir do fator.
 *
 * **O fator deu a volta.** Ele tem 4 dígitos e contava os dias desde
 * 07/10/1997, começando em 1000. Chegou a 9999 em 21/02/2025 e voltou para
 * 1000 em 22/02/2025. Então o MESMO fator significa duas datas, uma em cada
 * ciclo: 1585 é 15/05/1999 ou 30/09/2026.
 *
 * O desempate é `hoje`: vale o ciclo cuja data está mais perto de agora. Boleto
 * que se lê é boleto do mês — nenhuma das duas leituras precisa de adivinhação
 * além disso, e a que sobra está a décadas de distância.
 */
const CICLOS = ["1997-10-07", "2025-02-22"] as const;
const UM_DIA = 86_400_000;

export function vencimentoDoFator(linha: string, hoje: string): string | null {
  const fator = Number(linha.slice(33, 37));
  // Fator 0000 é boleto sem vencimento definido — existe, e não é erro.
  if (!Number.isFinite(fator) || fator < 1000) return null;

  const agora = Date.parse(`${hoje}T00:00:00Z`);

  const candidatas = CICLOS.map((inicio) => {
    const base = Date.parse(`${inicio}T00:00:00Z`);
    return base + (fator - 1000) * UM_DIA;
  });

  const escolhida = candidatas.reduce((melhor, atual) =>
    Math.abs(atual - agora) < Math.abs(melhor - agora) ? atual : melhor,
  );

  return new Date(escolhida).toISOString().slice(0, 10);
}

/* --------------------------------------------------------------------------
   O texto, para confirmar e para o que a linha não traz
   -------------------------------------------------------------------------- */

/** As datas `dd/mm/aaaa` do texto, em ISO e sem repetição. */
export function datasDoTexto(texto: string): string[] {
  const achadas = texto.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g) ?? [];
  const iso = achadas.map((d) => {
    const [dia, mes, ano] = d.split("/");
    return `${ano}-${mes}-${dia}`;
  });
  return [...new Set(iso)].sort();
}

/** Os valores `0.000,00` do texto, em número e sem repetição. Zero fica fora. */
export function valoresDoTexto(texto: string): number[] {
  const achados = texto.match(/\b\d{1,3}(?:\.\d{3})*,\d{2}\b/g) ?? [];
  const numeros = achados
    .map((v) => Number(v.replace(/\./g, "").replace(",", ".")))
    .filter((n) => Number.isFinite(n) && n > 0);
  return [...new Set(numeros)].sort((a, b) => a - b);
}

/**
 * A parcela.
 *
 * Procura o rótulo, e não um número qualquer: o boleto está cheio de
 * sequências de 2 e 3 dígitos — carteira, agência, espécie — e pegar a primeira
 * poria "148" no lugar de "44".
 */
export function parcelaDoTexto(texto: string): string | null {
  const rotulada = texto.match(/parcela\s*:?\s*(\d{1,3})\b/i);
  if (rotulada?.[1]) return String(Number(rotulada[1]));

  // Algumas seguradoras escrevem "Parcela 03/12".
  const fracao = texto.match(/parcela\s*:?\s*(\d{1,3})\s*\/\s*\d{1,3}/i);
  return fracao?.[1] ? String(Number(fracao[1])) : null;
}

/* --------------------------------------------------------------------------
   O que a tela recebe
   -------------------------------------------------------------------------- */

export function lerBoleto(texto: string, hoje: string): CamposDoBoleto {
  const avisos: string[] = [];
  const linha = acharLinhaDigitavel(texto);
  const parcela = parcelaDoTexto(texto);

  if (!linha) {
    // Sem linha digitável, sobra o texto — e aí a escolha entre as datas é um
    // chute. A maior é a mais provável (o vencimento vem depois da emissão),
    // mas isso é palpite e a tela precisa dizer que é.
    const datas = datasDoTexto(texto);
    const valores = valoresDoTexto(texto);

    if (!datas.length && !valores.length) {
      return {
        valor: null,
        vencimento: null,
        parcela,
        linhaDigitavel: null,
        confianca: "nenhuma",
        avisos: ["Não consegui ler este PDF. Preencha os campos à mão."],
      };
    }

    avisos.push("Não achei a linha digitável neste PDF; confira valor e vencimento.");

    return {
      // O maior valor é quase sempre o do documento; os menores são desconto,
      // multa e juros, que vêm zerados.
      valor: valores.length ? (valores[valores.length - 1] ?? null) : null,
      vencimento: datas.length ? (datas[datas.length - 1] ?? null) : null,
      parcela,
      linhaDigitavel: null,
      confianca: "media",
      avisos,
    };
  }

  const valor = valorDaLinha(linha);
  const vencimento = vencimentoDoFator(linha, hoje);

  // O texto confirma? Quando as duas fontes concordam, a analista só olha e
  // segue. Quando divergem, ela precisa saber ANTES de salvar.
  const valores = valoresDoTexto(texto);
  const datas = datasDoTexto(texto);

  const valorConfere = valor === null || valores.some((v) => Math.abs(v - valor) < 0.005);
  const dataConfere = vencimento === null || datas.includes(vencimento);

  if (!valorConfere) {
    avisos.push("O valor da linha digitável não aparece no texto do boleto. Confira.");
  }
  if (!dataConfere) {
    avisos.push("O vencimento da linha digitável não aparece no texto do boleto. Confira.");
  }
  if (valor === null) {
    avisos.push("Este boleto não traz valor na linha digitável.");
  }

  return {
    valor,
    vencimento,
    parcela,
    linhaDigitavel: linha,
    confianca: valorConfere && dataConfere && valor !== null ? "alta" : "media",
    avisos,
  };
}

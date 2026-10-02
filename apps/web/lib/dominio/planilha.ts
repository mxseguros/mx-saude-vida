import { cpfValido, normalizarDocumento } from "./documento";

/**
 * A planilha de vidas do mês, interpretada.
 *
 * Puro: recebe uma matriz de células já lidas e devolve linhas com os problemas
 * de cada uma. Quem abre o xlsx é `lib/controles/planilha.ts` — a divisão deixa
 * esta parte testável sem arquivo nenhum.
 *
 * **Nada aqui recusa a planilha.** O parser APONTA o que está estranho e a
 * analista decide: campo em branco quase sempre é informação que ela já tem por
 * telefone, e barrar o envio por isso faria o cliente reenviar o arquivo que
 * estava bom. A tela mostra em amarelo e segue.
 */

export type ColunaDaPlanilha =
  | "nome"
  | "cpf"
  | "nascimento"
  | "cargo"
  | "capital"
  | "setor"
  | "gestor"
  | "admissao";

/**
 * Como cada coluna pode estar escrita.
 *
 * A planilha vem do sistema de folha de cada cliente, e cada um chama a coluna
 * de um jeito: "Colaborador", "Nome", "Nome completo", "Funcionário". A lista é
 * de SINÔNIMOS porque recusar por nome de coluna faria a analista renomear o
 * cabeçalho à mão todo mês.
 *
 * Comparação sem acento e sem caixa — ver `chave`.
 */
const SINONIMOS: Record<ColunaDaPlanilha, readonly string[]> = {
  nome: ["nome", "colaborador", "nome completo", "funcionario", "segurado", "beneficiario"],
  cpf: ["cpf", "cpf/cnpj", "documento", "doc"],
  nascimento: ["data nascimento", "nascimento", "data de nascimento", "dt nascimento", "nasc"],
  cargo: ["cargo", "funcao", "ocupacao"],
  capital: ["capital", "capital segurado", "valor", "capital segurado individual"],
  setor: ["setor", "departamento", "area", "centro de custo"],
  gestor: ["gestor", "gestor responsavel", "responsavel", "lider"],
  admissao: ["admissao", "data admissao", "desde", "data de admissao", "dt admissao"],
};

/** As que, faltando, impedem conferir a linha. O resto é informativo. */
const OBRIGATORIAS: readonly ColunaDaPlanilha[] = ["nome", "cpf"] as const;

export const ROTULO_COLUNA: Record<ColunaDaPlanilha, string> = {
  nome: "Nome",
  cpf: "CPF",
  nascimento: "Nascimento",
  cargo: "Cargo",
  capital: "Capital",
  setor: "Setor",
  gestor: "Gestor",
  admissao: "Admissão",
};

export type Celula = string | number | Date | null | undefined;

function chave(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function texto(valor: Celula): string {
  if (valor === null || valor === undefined) return "";
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  return String(valor).trim();
}

/* --------------------------------------------------------------------------
   Achar o cabeçalho
   -------------------------------------------------------------------------- */

export type Cabecalho = {
  /** Índice da linha do cabeçalho, a partir de zero. */
  linha: number;
  /** Coluna de cada campo reconhecido, por índice. */
  colunas: Partial<Record<ColunaDaPlanilha, number>>;
};

/**
 * Onde começa a tabela.
 *
 * NÃO é a primeira linha. A planilha real da seguradora abre com
 * "APÓLICE NUMERO : 000700547" e só depois vem o cabeçalho — e algumas trazem
 * logotipo, linha em branco e totais antes. Procurar o cabeçalho em vez de
 * assumir a linha 1 é a diferença entre ler a planilha do cliente e exigir que
 * ele arrume o arquivo.
 *
 * Vale a primeira linha que reconhece as colunas OBRIGATÓRIAS. Uma linha com
 * só "Nome" pode ser um título; com "Nome" e "CPF" é cabeçalho.
 */
export function acharCabecalho(matriz: readonly Celula[][], limite = 30): Cabecalho | null {
  for (let i = 0; i < Math.min(matriz.length, limite); i += 1) {
    const linha = matriz[i];
    if (!linha) continue;

    const colunas: Partial<Record<ColunaDaPlanilha, number>> = {};

    linha.forEach((celula, indice) => {
      const nome = chave(texto(celula));
      if (!nome) return;

      for (const [campo, nomes] of Object.entries(SINONIMOS) as [ColunaDaPlanilha, readonly string[]][]) {
        // Já achou esta coluna numa posição anterior: a primeira vence, porque
        // planilhas repetem "Nome" num bloco lateral de desligados.
        if (colunas[campo] !== undefined) continue;
        if (nomes.includes(nome)) {
          colunas[campo] = indice;
          return;
        }
      }
    });

    if (OBRIGATORIAS.every((campo) => colunas[campo] !== undefined)) {
      return { linha: i, colunas };
    }
  }

  return null;
}

/* --------------------------------------------------------------------------
   Ler uma linha
   -------------------------------------------------------------------------- */

export type ProblemaDaLinha = {
  campo: ColunaDaPlanilha;
  tipo: "vazio" | "invalido";
  mensagem: string;
};

export type LinhaDaPlanilha = {
  /** O número da linha COMO NO EXCEL, a partir de 1: é o que a analista vê. */
  numero: number;
  nome: string | null;
  cpf: string | null;
  nascimento: string | null;
  cargo: string | null;
  capital: number | null;
  setor: string | null;
  gestor: string | null;
  admissao: string | null;
  problemas: ProblemaDaLinha[];
};

/**
 * Datas em planilha são três coisas diferentes.
 *
 * O xlsx guarda data como número de série, e o leitor pode devolver `Date`,
 * texto `dd/mm/aaaa` ou o número cru. Aceitar só um formato quebraria conforme
 * quem salvou o arquivo.
 */
export function lerData(valor: Celula): string | null {
  if (valor === null || valor === undefined || valor === "") return null;

  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? null : valor.toISOString().slice(0, 10);
  }

  const bruto = texto(valor);

  // Já em ISO, com ou sem hora.
  const iso = bruto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // `dd/mm/aaaa` ou `dd-mm-aaaa`, que é como se digita aqui.
  const brasileira = bruto.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (brasileira) {
    const dia = brasileira[1]?.padStart(2, "0") ?? "";
    const mes = brasileira[2]?.padStart(2, "0") ?? "";
    const anoBruto = brasileira[3] ?? "";
    // Ano de dois dígitos: 30 vira 1930, não 2030 — é data de nascimento.
    const ano = anoBruto.length === 4 ? anoBruto : Number(anoBruto) > 30 ? `19${anoBruto}` : `20${anoBruto}`;
    return plausivel(`${ano}-${mes}-${dia}`) ? `${ano}-${mes}-${dia}` : null;
  }

  return null;
}

/** Data que o calendário aceita e que não é de outro século. */
function plausivel(iso: string): boolean {
  const data = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(data.getTime())) return false;
  if (data.toISOString().slice(0, 10) !== iso) return false;
  const ano = Number(iso.slice(0, 4));
  return ano >= 1900 && ano <= 2100;
}

/**
 * O capital.
 *
 * `100000.0` e `R$ 100.000,00` são o mesmo número escrito por sistemas
 * diferentes. O desempate entre ponto de milhar e separador decimal é a
 * posição: `100.000` com três dígitos depois do ponto é milhar.
 */
export function lerValor(valor: Celula): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;

  const bruto = texto(valor).replace(/[R$\s]/gi, "");
  if (!bruto) return null;

  let normalizado = bruto;
  if (bruto.includes(",")) {
    // Vírgula presente: ela é o decimal e o ponto é milhar.
    normalizado = bruto.replace(/\./g, "").replace(",", ".");
  } else if (/\.\d{3}$/.test(bruto)) {
    // Só ponto, com três dígitos depois: milhar.
    normalizado = bruto.replace(/\./g, "");
  }

  const numero = Number(normalizado);
  return Number.isFinite(numero) && numero >= 0 ? numero : null;
}

export function lerLinhaDaPlanilha(
  celulas: readonly Celula[],
  numeroNoExcel: number,
  colunas: Cabecalho["colunas"],
): LinhaDaPlanilha {
  const pegar = (campo: ColunaDaPlanilha): Celula => {
    const indice = colunas[campo];
    return indice === undefined ? null : celulas[indice];
  };

  const problemas: ProblemaDaLinha[] = [];

  const nome = texto(pegar("nome")) || null;
  if (!nome) {
    problemas.push({ campo: "nome", tipo: "vazio", mensagem: "Sem nome." });
  }

  const cpfBruto = texto(pegar("cpf"));
  let cpf: string | null = null;
  if (!cpfBruto) {
    problemas.push({ campo: "cpf", tipo: "vazio", mensagem: "Sem CPF." });
  } else {
    const digitos = normalizarDocumento(cpfBruto);
    if (!cpfValido(digitos)) {
      problemas.push({ campo: "cpf", tipo: "invalido", mensagem: "CPF não confere." });
      // Guarda o que veio: a analista precisa ver o número errado para saber o
      // que corrigir, e esconder o valor inválido a obrigaria a abrir o xlsx.
      cpf = digitos || null;
    } else {
      cpf = digitos;
    }
  }

  const nascimentoBruto = pegar("nascimento");
  const nascimento = lerData(nascimentoBruto);
  if (colunas.nascimento !== undefined && texto(nascimentoBruto) && !nascimento) {
    problemas.push({ campo: "nascimento", tipo: "invalido", mensagem: "Nascimento não é uma data." });
  }

  const admissaoBruta = pegar("admissao");
  const admissao = lerData(admissaoBruta);
  if (colunas.admissao !== undefined && texto(admissaoBruta) && !admissao) {
    problemas.push({ campo: "admissao", tipo: "invalido", mensagem: "Admissão não é uma data." });
  }

  const capitalBruto = pegar("capital");
  const capital = lerValor(capitalBruto);
  if (colunas.capital !== undefined && texto(capitalBruto) && capital === null) {
    problemas.push({ campo: "capital", tipo: "invalido", mensagem: "Capital não é um número." });
  }

  // Cargo, setor e gestor em branco NÃO são problema: o cliente pode não ter
  // essas listas, e a decisão de 23/09 foi deixar os dois últimos opcionais.
  return {
    numero: numeroNoExcel,
    nome,
    cpf,
    nascimento,
    cargo: texto(pegar("cargo")) || null,
    capital,
    setor: texto(pegar("setor")) || null,
    gestor: texto(pegar("gestor")) || null,
    admissao,
    problemas,
  };
}

/* --------------------------------------------------------------------------
   A planilha inteira
   -------------------------------------------------------------------------- */

export type Planilha = {
  /** `null` quando não achei cabeçalho: a tela pede o arquivo no modelo. */
  cabecalho: Cabecalho | null;
  linhas: LinhaDaPlanilha[];
  /** Colunas que o modelo pede e o arquivo não tem. */
  colunasAusentes: ColunaDaPlanilha[];
  total: number;
  comProblema: number;
  /** Linhas puladas por estarem inteiramente vazias. */
  vazias: number;
};

/**
 * Lê a matriz inteira.
 *
 * Para de ler depois de uma sequência de linhas vazias: a planilha da
 * seguradora vem com 1.041 linhas e 104 vidas — o resto é a grade do Excel. Ler
 * tudo poria mil linhas em branco na prévia e cada uma com "Sem nome".
 */
const VAZIAS_PARA_PARAR = 15;

export function lerPlanilha(matriz: readonly Celula[][]): Planilha {
  const cabecalho = acharCabecalho(matriz);

  if (!cabecalho) {
    return {
      cabecalho: null,
      linhas: [],
      colunasAusentes: [...OBRIGATORIAS],
      total: 0,
      comProblema: 0,
      vazias: 0,
    };
  }

  const usadas = Object.values(cabecalho.colunas).filter((i): i is number => i !== undefined);
  const linhas: LinhaDaPlanilha[] = [];
  let vazias = 0;
  let seguidasVazias = 0;

  for (let i = cabecalho.linha + 1; i < matriz.length; i += 1) {
    const celulas = matriz[i] ?? [];

    // Vazia é vazia NAS COLUNAS DA TABELA. A planilha real tem um bloco lateral
    // de desligados na coluna I, e olhar a linha inteira faria essas linhas
    // contarem como preenchidas.
    const temAlgo = usadas.some((indice) => texto(celulas[indice]) !== "");

    if (!temAlgo) {
      vazias += 1;
      seguidasVazias += 1;
      if (seguidasVazias >= VAZIAS_PARA_PARAR) break;
      continue;
    }

    seguidasVazias = 0;
    linhas.push(lerLinhaDaPlanilha(celulas, i + 1, cabecalho.colunas));
  }

  const colunasAusentes = (Object.keys(SINONIMOS) as ColunaDaPlanilha[]).filter(
    (campo) => cabecalho.colunas[campo] === undefined,
  );

  return {
    cabecalho,
    linhas,
    colunasAusentes,
    total: linhas.length,
    comProblema: linhas.filter((l) => l.problemas.length > 0).length,
    vazias,
  };
}

/** CPFs que aparecem mais de uma vez — a mesma pessoa contada duas vezes. */
export function cpfsRepetidos(linhas: readonly LinhaDaPlanilha[]): string[] {
  const contagem = new Map<string, number>();
  for (const linha of linhas) {
    if (!linha.cpf) continue;
    contagem.set(linha.cpf, (contagem.get(linha.cpf) ?? 0) + 1);
  }
  return [...contagem.entries()].filter(([, quantas]) => quantas > 1).map(([cpf]) => cpf);
}

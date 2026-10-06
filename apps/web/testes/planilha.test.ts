import { describe, expect, it } from "vitest";

import {
  acharCabecalho,
  cpfsRepetidos,
  lerData,
  lerLinhaDaPlanilha,
  lerPlanilha,
  lerValor,
  type Celula,
} from "../lib/dominio/planilha";

/**
 * A planilha de vidas do mês.
 *
 * Os CPFs aqui são SINTÉTICOS — dígitos verificadores calculados para serem
 * válidos, mas de pessoa nenhuma. Repositório público não recebe CPF de
 * funcionário de cliente.
 *
 * O parser foi provado contra a planilha real do Soberano, fora do repo: 1.041
 * linhas no arquivo, cabeçalho na linha 2, **104 vidas** lidas, 1 CPF inválido
 * achado, 937 linhas em branco puladas.
 */

/** CPFs válidos construídos para teste. */
const CPF_A = "52998224725";
const CPF_B = "11144477735";

const CABECALHO: Celula[] = ["Colaborador", "Cargo", "Data Nascimento", "CPF", "CAPITAL"];

function matriz(...linhas: Celula[][]): Celula[][] {
  return linhas;
}

describe("achar o cabeçalho", () => {
  /**
   * A planilha real abre com "APÓLICE NUMERO : 000700547" e o cabeçalho vem na
   * linha 2. Assumir a linha 1 seria exigir que o cliente arrumasse o arquivo.
   */
  it("não é a primeira linha", () => {
    const achado = acharCabecalho(matriz(["APÓLICE NUMERO : 000700547"], CABECALHO, ["Maria", "FUNC I", "", CPF_A, 60000]));
    expect(achado?.linha).toBe(1);
    expect(achado?.colunas.nome).toBe(0);
    expect(achado?.colunas.cpf).toBe(3);
  });

  it("reconhece sinônimos de cada coluna", () => {
    const achado = acharCabecalho(matriz(["Funcionário", "Documento", "Nasc", "Função", "Centro de custo"]));
    expect(achado?.colunas.nome).toBe(0);
    expect(achado?.colunas.cpf).toBe(1);
    expect(achado?.colunas.nascimento).toBe(2);
    expect(achado?.colunas.cargo).toBe(3);
    expect(achado?.colunas.setor).toBe(4);
  });

  it("ignora acento e caixa", () => {
    expect(acharCabecalho(matriz(["NOME COMPLETO", "cpf"]))?.colunas.nome).toBe(0);
    expect(acharCabecalho(matriz(["Admissão", "Nome", "CPF"]))?.colunas.admissao).toBe(0);
  });

  it("colunas em outra ordem servem", () => {
    const achado = acharCabecalho(matriz(["CPF", "Capital", "Nome"]));
    expect(achado?.colunas.cpf).toBe(0);
    expect(achado?.colunas.nome).toBe(2);
  });

  // Uma linha com só "Nome" pode ser um título; com "Nome" e "CPF" é cabeçalho.
  it("exige nome E cpf para ser cabeçalho", () => {
    expect(acharCabecalho(matriz(["Relação de vidas"], ["Nome"]))).toBeNull();
    expect(acharCabecalho(matriz(["Nome", "CPF"]))).not.toBeNull();
  });

  it("sem cabeçalho nenhum, devolve nulo em vez de adivinhar", () => {
    expect(acharCabecalho(matriz(["a", "b"], ["c", "d"]))).toBeNull();
  });

  /**
   * A planilha real tem um bloco lateral de desligados que repete "Nome" na
   * coluna I. A primeira posição vence.
   */
  it("coluna repetida: a primeira vence", () => {
    const achado = acharCabecalho(matriz(["Nome", "CPF", "", "Nome", "CPF"]));
    expect(achado?.colunas.nome).toBe(0);
    expect(achado?.colunas.cpf).toBe(1);
  });
});

describe("datas", () => {
  it("aceita Date, ISO e dd/mm/aaaa", () => {
    expect(lerData(new Date("1976-08-27T00:00:00Z"))).toBe("1976-08-27");
    expect(lerData("1976-08-27 00:00:00")).toBe("1976-08-27");
    expect(lerData("27/08/1976")).toBe("1976-08-27");
    expect(lerData("27-08-1976")).toBe("1976-08-27");
  });

  it("completa dia e mês de um dígito", () => {
    expect(lerData("1/3/1999")).toBe("1999-03-01");
  });

  // Ano de dois dígitos num campo de nascimento: 76 é 1976, não 2076.
  it("ano de dois dígitos acima de 30 é do século passado", () => {
    expect(lerData("27/08/76")).toBe("1976-08-27");
    expect(lerData("15/05/05")).toBe("2005-05-15");
  });

  it("recusa data impossível e texto", () => {
    expect(lerData("31/02/1990")).toBeNull();
    expect(lerData("sem data")).toBeNull();
    expect(lerData("")).toBeNull();
    expect(lerData(null)).toBeNull();
  });

  it("recusa ano fora do plausível", () => {
    expect(lerData("01/01/1850")).toBeNull();
  });
});

describe("capital", () => {
  it("número cru e texto formatado dão o mesmo valor", () => {
    expect(lerValor(100000)).toBe(100000);
    expect(lerValor("100000.0")).toBe(100000);
    expect(lerValor("R$ 100.000,00")).toBe(100000);
    expect(lerValor("100.000")).toBe(100000);
  });

  it("vírgula é decimal", () => {
    expect(lerValor("23.103,62")).toBe(23103.62);
    expect(lerValor("1,5")).toBe(1.5);
  });

  it("vazio é nulo, texto é nulo", () => {
    expect(lerValor("")).toBeNull();
    expect(lerValor(null)).toBeNull();
    expect(lerValor("a combinar")).toBeNull();
  });
});

describe("uma linha", () => {
  const colunas = { nome: 0, cargo: 1, nascimento: 2, cpf: 3, capital: 4 };

  it("linha boa não tem problema", () => {
    const linha = lerLinhaDaPlanilha(["Maria Silva", "FUNC I", "27/08/1976", CPF_A, 60000], 3, colunas);
    expect(linha.problemas).toEqual([]);
    expect(linha.cpf).toBe(CPF_A);
    expect(linha.nascimento).toBe("1976-08-27");
    expect(linha.capital).toBe(60000);
    // O número é o do EXCEL: é o que a analista vê na tela dela.
    expect(linha.numero).toBe(3);
  });

  it("aponta nome e CPF em branco", () => {
    const linha = lerLinhaDaPlanilha(["", "FUNC I", "", "", null], 5, colunas);
    expect(linha.problemas.map((p) => p.campo)).toEqual(["nome", "cpf"]);
  });

  /**
   * O número errado FICA na linha: a analista precisa vê-lo para saber o que
   * corrigir, e esconder o inválido a obrigaria a abrir o xlsx.
   */
  it("CPF que não confere é apontado, e o valor fica", () => {
    const linha = lerLinhaDaPlanilha(["Maria", "", "", "11111111111", null], 4, colunas);
    expect(linha.problemas[0]).toMatchObject({ campo: "cpf", tipo: "invalido" });
    expect(linha.cpf).toBe("11111111111");
  });

  it("data e capital inválidos são apontados", () => {
    const linha = lerLinhaDaPlanilha(["Maria", "", "amanhã", CPF_A, "a combinar"], 4, colunas);
    const campos = linha.problemas.map((p) => p.campo);
    expect(campos).toContain("nascimento");
    expect(campos).toContain("capital");
  });

  // Decisão de 23/09: funcionário pode ficar sem setor e sem gestor.
  it("cargo, setor e gestor em branco NÃO são problema", () => {
    const linha = lerLinhaDaPlanilha(["Maria", "", "27/08/1976", CPF_A, 60000], 3, colunas);
    expect(linha.problemas).toEqual([]);
    expect(linha.cargo).toBeNull();
  });

  it("coluna que o arquivo não tem não gera problema", () => {
    const linha = lerLinhaDaPlanilha(["Maria", CPF_A], 2, { nome: 0, cpf: 1 });
    expect(linha.problemas).toEqual([]);
    expect(linha.nascimento).toBeNull();
  });
});

describe("a planilha inteira", () => {
  it("lê as linhas e conta os problemas", () => {
    const p = lerPlanilha(
      matriz(
        ["APÓLICE NUMERO : 000700547"],
        CABECALHO,
        ["Maria Silva", "FUNC I", "27/08/1976", CPF_A, 60000],
        ["João Souza", "FUNC II", "15/03/1968", CPF_B, 100000],
        ["Sem Documento", "FUNC I", "", "", 60000],
      ),
    );

    expect(p.total).toBe(3);
    expect(p.comProblema).toBe(1);
    expect(p.cabecalho?.linha).toBe(1);
    expect(p.colunasAusentes).toEqual(["setor", "gestor", "admissao", "salario"]);
  });

  /**
   * A planilha real tem 1.041 linhas e 104 vidas: o resto é a grade do Excel.
   * Ler tudo poria 937 linhas em branco na prévia, cada uma com "Sem nome".
   */
  it("para depois de uma sequência de linhas vazias", () => {
    const vazias = Array.from({ length: 500 }, () => [] as Celula[]);
    const p = lerPlanilha(
      matriz(CABECALHO, ["Maria", "FUNC I", "27/08/1976", CPF_A, 60000], ...vazias),
    );

    expect(p.total).toBe(1);
    expect(p.vazias).toBeLessThan(20);
  });

  /**
   * Vazia é vazia NAS COLUNAS DA TABELA. A planilha real tem desligados num
   * bloco lateral, e olhar a linha inteira faria essas linhas contarem.
   */
  it("texto em coluna de fora não faz a linha contar", () => {
    const p = lerPlanilha(
      matriz(CABECALHO, ["", "", "", "", null, null, null, null, "SAIU:"], ["", "", "", "", null, null, null, null, "Carlos"]),
    );
    expect(p.total).toBe(0);
  });

  it("sem cabeçalho, devolve vazio e diz o que falta", () => {
    const p = lerPlanilha(matriz(["lorem"], ["ipsum"]));
    expect(p.cabecalho).toBeNull();
    expect(p.linhas).toEqual([]);
    expect(p.colunasAusentes).toEqual(["nome", "cpf"]);
  });
});

describe("CPF repetido", () => {
  it("acha a mesma pessoa contada duas vezes", () => {
    const p = lerPlanilha(
      matriz(
        CABECALHO,
        ["Maria", "", "", CPF_A, null],
        ["Maria Silva", "", "", CPF_A, null],
        ["João", "", "", CPF_B, null],
      ),
    );
    expect(cpfsRepetidos(p.linhas)).toEqual([CPF_A]);
  });

  it("sem repetição, lista vazia", () => {
    const p = lerPlanilha(matriz(CABECALHO, ["Maria", "", "", CPF_A, null]));
    expect(cpfsRepetidos(p.linhas)).toEqual([]);
  });
});

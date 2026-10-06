import { describe, expect, it } from "vitest";

import { datasDaCompetencia } from "../lib/dominio/controle";
import { porCampo, validar } from "../lib/dominio/validar";
import {
  BYTES_DO_TOKEN,
  DIAS_MINIMOS,
  diasParaFechar,
  estadoDoLink,
  pareceToken,
  roboDePrevia,
  esquemaColeta,
  movimentosDaColeta,
  tokenDeColeta,
  valeAte,
} from "../lib/dominio/coleta";

/**
 * O prazo do link e os quatro estados da rota pública.
 *
 * O que estes testes guardam são duas decisões do Gabriel, de 05/10, que não
 * dá para ler no código sem elas: o link vale **até o corte**, e quem já
 * enviou **continua entrando**.
 */

const DATAS = { informar: "2026-09-08", corte: "2026-09-10", boleto: "2026-09-16", vencimento: "2026-09-30" };

describe("até quando o link vale", () => {
  it("vale até o corte", () => {
    expect(valeAte(DATAS, "2026-09-01")).toBe("2026-09-10");
  });

  /**
   * O caso que o piso existe para resolver: a analista manda o link no dia 20,
   * e o corte foi no dia 10. Sem piso o link nasceria expirado, e o gestor
   * clicaria no WhatsApp para ler "este link expirou" — beco sem saída, que
   * neste projeto é defeito.
   */
  it("link mandado depois do corte ainda abre, pelo piso", () => {
    expect(valeAte(DATAS, "2026-09-20")).toBe("2026-09-23");
  });

  it("no próprio dia do corte, o corte ainda é menor que o piso", () => {
    // Corte dia 10, hoje dia 10: o corte não dá mais prazo nenhum, então o
    // piso assume. O gestor tem o dia de hoje e mais três.
    expect(valeAte(DATAS, "2026-09-10")).toBe("2026-09-13");
  });

  it("o piso atravessa a virada do mês", () => {
    expect(valeAte(DATAS, "2026-09-30")).toBe("2026-10-03");
  });

  /**
   * Apólice sem movimentação — saúde PME, global, transporte — não tem corte.
   * Esse cliente não deveria receber link; se receber, o prazo é o boleto, que
   * é a próxima data que existe.
   */
  it("sem corte, vale até o boleto", () => {
    const sem = { ...DATAS, informar: null, corte: null };
    expect(valeAte(sem, "2026-09-01")).toBe("2026-09-16");
  });

  it("o piso é de três dias", () => {
    expect(DIAS_MINIMOS).toBe(3);
    expect(diasParaFechar(valeAte(DATAS, "2026-09-20"), "2026-09-20")).toBe(DIAS_MINIMOS);
  });

  /**
   * Fevereiro e a virada do ano, pelas datas de verdade: o corte de uma
   * competência pode cair no mês seguinte quando o dia cadastrado é menor que
   * o do "informar" — e o prazo do link precisa seguir a data, não a
   * competência.
   */
  it("acompanha a data real da competência, não o mês dela", () => {
    const regras = { informarDia: 28, corteDia: 2, boletoDia: 10, vencimentoDia: 20 };
    const datas = datasDaCompetencia("2026-12", regras);
    expect(datas?.corte).toBe("2027-01-02");
    expect(valeAte(datas!, "2026-12-28")).toBe("2027-01-02");
  });
});

describe("o estado do link", () => {
  const aberto = { token: "t", valeAte: "2026-09-10", recebidoEm: null };

  it("dentro do prazo, abre", () => {
    expect(estadoDoLink(aberto, "2026-09-01")).toBe("aberto");
  });

  it("o último dia ainda abre", () => {
    expect(estadoDoLink(aberto, "2026-09-10")).toBe("aberto");
  });

  it("um dia depois, expirou", () => {
    expect(estadoDoLink(aberto, "2026-09-11")).toBe("expirado");
  });

  /**
   * A decisão #3 do Gabriel: "pode mudar, porém deve exibir um alerta para o
   * analista MX". Se o link fechasse no corte para quem já enviou, o gestor
   * perderia a única cópia do que mandou — ele não tem conta para consultar em
   * outro lugar. Por isso `enviado` ganha de `expirado`.
   */
  it("quem já enviou continua entrando, mesmo depois do corte", () => {
    const enviado = { ...aberto, recebidoEm: "2026-09-05T12:00:00Z" };
    expect(estadoDoLink(enviado, "2026-09-05")).toBe("enviado");
    expect(estadoDoLink(enviado, "2026-11-30")).toBe("enviado");
  });

  it("mês sem link gerado é inválido, não expirado", () => {
    expect(estadoDoLink({ token: null, valeAte: null, recebidoEm: null }, "2026-09-01")).toBe("invalido");
  });

  /**
   * Token que não casa com mês nenhum. A consulta devolve nada, e `null` tem
   * que virar `invalido` em vez de explodir: a rota é pública, e quem bate nela
   * com um token inventado não pode receber um 500.
   */
  it("token que não existe é inválido", () => {
    expect(estadoDoLink(null, "2026-09-01")).toBe("invalido");
  });

  // Estado inconsistente — token sem prazo — é inválido, e não aberto. A
  // migration tem um check que impede isso no banco; aqui é o cinto.
  it("token sem prazo é inválido", () => {
    expect(estadoDoLink({ token: "t", valeAte: null, recebidoEm: null }, "2026-09-01")).toBe("invalido");
  });
});

describe("dias para fechar", () => {
  it("conta o que falta", () => {
    expect(diasParaFechar("2026-09-10", "2026-09-01")).toBe(9);
    expect(diasParaFechar("2026-09-10", "2026-09-10")).toBe(0);
    expect(diasParaFechar("2026-09-10", "2026-09-12")).toBe(-2);
  });

  /**
   * Em São Paulo o horário de verão acabou em 2019, mas a conta é em UTC de
   * propósito: um fuso com salto de uma hora faria uma diferença de 9 dias
   * virar 8,96 e arredondar errado em alguma data do ano.
   */
  it("a virada do ano não perde um dia", () => {
    expect(diasParaFechar("2027-01-02", "2026-12-28")).toBe(5);
  });
});

describe("o token", () => {
  const bytes = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 7 + 3) % 256);

  it("32 bytes viram 43 caracteres de base64url", () => {
    const token = tokenDeColeta(bytes(BYTES_DO_TOKEN));
    expect(token).toHaveLength(43);
    expect(pareceToken(token)).toBe(true);
  });

  /**
   * `+`, `/` e `=` do base64 comum quebram numa URL: `+` vira espaço, `/` vira
   * segmento de rota e `=` abre query. O gestor clicaria no WhatsApp e cairia
   * num 404.
   */
  it("não sai nada que uma URL precise escapar", () => {
    for (let semente = 0; semente < 200; semente += 1) {
      const token = tokenDeColeta(Uint8Array.from({ length: 32 }, (_, i) => (i * 31 + semente) % 256));
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(encodeURIComponent(token)).toBe(token);
    }
  });

  it("bytes diferentes, tokens diferentes", () => {
    expect(tokenDeColeta(bytes(32))).not.toBe(tokenDeColeta(bytes(33).slice(1)));
  });

  /**
   * Recusa em vez de truncar. Um token curto por engano de quem chama entraria
   * no banco parecendo legítimo e seria adivinhável — falha que não dá sinal.
   */
  it("menos de 32 bytes é erro, não token curto", () => {
    expect(() => tokenDeColeta(bytes(31))).toThrow(/32 bytes/);
  });

  it("o formato recusa o que não é token", () => {
    expect(pareceToken("")).toBe(false);
    expect(pareceToken("curto")).toBe(false);
    expect(pareceToken("a".repeat(65))).toBe(false);
    expect(pareceToken(`${"a".repeat(42)}/..`)).toBe(false);
    expect(pareceToken(`${"a".repeat(42)} `)).toBe(false);
  });
});

describe("o formulário do gestor", () => {
  const base = {
    nome: "Gestor Exemplo",
    celular: "(55) 55555-5555",
    setor: "",
    semMovimentacao: false,
    entradas: [{ nome: "Pessoa Que Entrou", documento: "999.999.990-50" }],
    saidas: [],
    planilhaId: "",
    observacao: "",
  };

  function analisar(troca: Record<string, unknown> = {}) {
    return validar(esquemaColeta, { ...base, ...troca });
  }

  it("um envio completo passa", () => {
    const r = analisar();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.dados.celular).toBe("55555555555");
      expect(r.dados.entradas[0]?.documento).toBe("99999999050");
      expect(r.dados.setor).toBeNull();
      expect(r.dados.planilhaId).toBeNull();
    }
  });

  /**
   * O CPF é opcional de propósito. O gestor que não o tem à mão informa o nome
   * e a analista completa pela planilha; exigir aqui faria ele inventar um
   * número para o formulário deixar passar — e dado errado parecendo certo é
   * pior que dado faltando.
   */
  it("pessoa sem CPF passa", () => {
    const r = analisar({ entradas: [{ nome: "Pessoa Sem Documento", documento: "" }] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.dados.entradas[0]?.documento).toBeNull();
  });

  it("CPF inválido é recusado, e aponta a pessoa", () => {
    const r = analisar({ entradas: [{ nome: "Pessoa Com CPF Errado", documento: "11111111111" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(porCampo(r.erros)["entradas.0.documento"]).toBe("CPF inválido.");
  });

  it("nome curto é recusado", () => {
    const r = analisar({ entradas: [{ nome: "Jo", documento: "" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(porCampo(r.erros)["entradas.0.nome"]).toMatch(/nome completo/i);
  });

  it("o atalho sozinho passa", () => {
    const r = analisar({ semMovimentacao: true, entradas: [] });
    expect(r.ok).toBe(true);
  });

  /**
   * O atalho é uma AFIRMAÇÃO — ele manda o mês direto para conferido. Marcá-lo
   * com gente na lista é contradição, e quem está na tela resolve melhor que a
   * analista depois.
   */
  it("o atalho com gente na lista é recusado", () => {
    const r = analisar({ semMovimentacao: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(porCampo(r.erros).semMovimentacao).toMatch(/Desmarque/);
  });

  /**
   * Só a planilha BASTA. O gestor que tem o arquivo pronto não vai redigitar
   * quarenta nomes, e recusá-lo transformaria "a planilha é opcional" em "a
   * planilha não serve".
   */
  it("só a planilha basta", () => {
    const r = analisar({ entradas: [], planilhaId: "f0000000-0000-0000-0000-00000000000a" });
    expect(r.ok).toBe(true);
  });

  it("formulário vazio é recusado, e aponta o atalho", () => {
    const r = analisar({ entradas: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(porCampo(r.erros).semMovimentacao).toMatch(/Ninguém entrou nem saiu/);
  });

  it("celular incompleto é recusado", () => {
    const r = analisar({ celular: "5555" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(porCampo(r.erros).celular).toMatch(/DDD/);
  });

  /**
   * Todos de uma vez (regra 3): um formulário que corrige um erro por vez faz
   * o gestor enviar cinco vezes, e na quinta ele desiste e manda por e-mail.
   */
  it("devolve todos os erros de uma vez", () => {
    const r = analisar({ nome: "", celular: "", entradas: [{ nome: "Jo", documento: "11111111111" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const campos = Object.keys(porCampo(r.erros));
      expect(campos).toContain("nome");
      expect(campos).toContain("celular");
      expect(campos).toContain("entradas.0.nome");
      expect(campos).toContain("entradas.0.documento");
    }
  });

  /**
   * `porQuem` NÃO vem do corpo do POST. O navegador do gestor não tem como se
   * declarar `equipe`, e aceitar esse campo deixaria qualquer um marcar a
   * própria linha como vinda da MX — e a Fase 5 ignoraria justamente o que ela
   * precisa cruzar com a planilha.
   */
  it("quem digitou é decidido pela rota, não pelo envio", () => {
    const r = analisar({ saidas: [{ nome: "Pessoa Que Saiu", documento: "" }], porQuem: "equipe" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const movimentos = movimentosDaColeta(r.dados, "gestor");
    expect(movimentos).toHaveLength(2);
    expect(movimentos.every((m) => m.porQuem === "gestor")).toBe(true);
    expect(movimentos.map((m) => m.tipo)).toEqual(["entrada", "saida"]);
  });

  it("arquivo que não é uuid é recusado", () => {
    const r = analisar({ planilhaId: "../../etc/passwd" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(porCampo(r.erros).planilhaId).toBe("Arquivo inválido.");
  });
});

describe("entrada com dados de inclusão (06/10)", () => {
  const base = {
    nome: "Gestor Exemplo",
    celular: "55555555555",
    semMovimentacao: false,
    saidas: [],
    planilhaId: "",
  };
  const entrada = (troca: Record<string, unknown> = {}) =>
    validar(esquemaColeta, {
      ...base,
      entradas: [{ nome: "Pessoa Que Entrou", documento: "", nascimento: "12/03/1990", cargo: "Operador", salario: "R$ 3.500,00", ...troca }],
    });

  it("nascimento, cargo e salário entram convertidos", () => {
    const r = entrada();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.dados.entradas[0]).toMatchObject({ nascimento: "1990-03-12", cargo: "Operador", salario: 3500 });
  });

  it("os três são opcionais", () => {
    const r = entrada({ nascimento: "", cargo: "", salario: "" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.dados.entradas[0]).toMatchObject({ nascimento: null, cargo: null, salario: null });
  });

  // O `Date` do JavaScript transformaria 31/02 em 03/03 sem avisar.
  it("data que não existe é recusada, não corrigida", () => {
    const r = entrada({ nascimento: "31/02/1990" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(porCampo(r.erros)["entradas.0.nascimento"]).toMatch(/inválida/);
  });

  it("nascimento no futuro é recusado", () => {
    const r = entrada({ nascimento: "01/01/2999" });
    expect(r.ok).toBe(false);
  });

  it("salário zero é recusado", () => {
    const r = entrada({ salario: "R$ 0,00" });
    expect(r.ok).toBe(false);
  });

  it("saída não carrega dado de inclusão, mesmo que o corpo mande", () => {
    const r = validar(esquemaColeta, {
      ...base,
      entradas: [],
      saidas: [{ nome: "Pessoa Que Saiu", documento: "", nascimento: "12/03/1990", salario: "100" }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [saida] = movimentosDaColeta(r.dados, "gestor");
    expect(saida).toMatchObject({ tipo: "saida", nascimento: null, cargo: null, salario: null });
  });
});

describe("robô de prévia não conta como abertura", () => {
  it("reconhece o WhatsApp e os outros leitores de cartão", () => {
    expect(roboDePrevia("WhatsApp/2.23.20.0 A")).toBe(true);
    expect(roboDePrevia("facebookexternalhit/1.1")).toBe(true);
    expect(roboDePrevia("TelegramBot (like TwitterBot)")).toBe(true);
  });
  it("celular de gente é abertura", () => {
    expect(roboDePrevia("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36")).toBe(false);
    expect(roboDePrevia(null)).toBe(false);
  });
});

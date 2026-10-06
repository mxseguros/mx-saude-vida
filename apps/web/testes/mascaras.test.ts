import { describe, expect, it } from "vitest";
import {
  cepValido,
  dataBrParaIso,
  isoParaDataBr,
  mascararData,
  mascararInteiro,
  emailValido,
  formatarMoeda,
  mascararAno,
  mascararCep,
  mascararCodigo,
  mascararDocumento,
  mascararEmail,
  mascararMoeda,
  mascararTelefone,
  mascararUf,
  telefoneValido,
  valorParaNumero,
} from "../lib/dominio/mascaras";

/** Digita caractere a caractere, como a pessoa faz. */
function digitando(mascara: (v: string) => string, texto: string): string {
  let campo = "";
  for (const tecla of texto) campo = mascara(campo + tecla);
  return campo;
}

describe("moeda", () => {
  it("os dois ultimos digitos sao os centavos, como na maquininha", () => {
    expect(mascararMoeda("250000")).toBe("R$ 2.500,00");
    expect(mascararMoeda("5")).toBe("R$ 0,05");
    expect(mascararMoeda("50")).toBe("R$ 0,50");
    expect(mascararMoeda("500")).toBe("R$ 5,00");
  });

  it("sobrevive a digitacao tecla a tecla", () => {
    expect(digitando(mascararMoeda, "250000")).toBe("R$ 2.500,00");
  });

  it("e estavel: colar o que ela mesma produziu devolve igual", () => {
    expect(mascararMoeda("R$ 2.500,00")).toBe("R$ 2.500,00");
  });

  it("campo vazio continua vazio — nao vira R$ 0,00", () => {
    expect(mascararMoeda("")).toBe("");
    expect(mascararMoeda("abc")).toBe("");
  });

  it("formata o numero que veio do banco", () => {
    expect(formatarMoeda(2500)).toBe("R$ 2.500,00");
    expect(formatarMoeda("2500")).toBe("R$ 2.500,00");
    expect(formatarMoeda(0)).toBe("R$ 0,00");
    expect(formatarMoeda(1234567.89)).toBe("R$ 1.234.567,89");
  });

  it("distingue campo vazio de zero", () => {
    expect(formatarMoeda(null)).toBe("");
    expect(formatarMoeda(undefined)).toBe("");
    expect(formatarMoeda(0)).toBe("R$ 0,00");
  });
});

describe("telefone", () => {
  it("formata enquanto digita", () => {
    expect(mascararTelefone("11")).toBe("(11");
    expect(mascararTelefone("119")).toBe("(11) 9");
    expect(mascararTelefone("11987654321")).toBe("(11) 98765-4321");
    expect(mascararTelefone("1134567890")).toBe("(11) 3456-7890");
  });

  it("sobrevive a digitacao tecla a tecla", () => {
    expect(digitando(mascararTelefone, "11987654321")).toBe("(11) 98765-4321");
  });

  it("nao remonta numero estrangeiro no formato daqui", () => {
    expect(mascararTelefone("+1 415 555 0134")).toBe("+1 415 555 0134");
  });

  it("recusa DDD que nao existe e celular sem o 9", () => {
    expect(telefoneValido("(11) 98765-4321")).toBe(true);
    expect(telefoneValido("(11) 3456-7890")).toBe(true);
    expect(telefoneValido("(09) 98765-4321")).toBe(false);
    expect(telefoneValido("11887654321")).toBe(false);
    expect(telefoneValido("987654321")).toBe(false);
  });
});

describe("documento", () => {
  it("CPF progressivo ate 11 digitos", () => {
    expect(mascararDocumento("999")).toBe("999");
    expect(mascararDocumento("999000")).toBe("999.000");
    expect(mascararDocumento("99900000005")).toBe("999.000.000-05");
  });

  it("vira CNPJ do 12o digito em diante", () => {
    expect(mascararDocumento("99999999000191")).toBe("99.999.999/0001-91");
  });

  it("sobrevive a digitacao tecla a tecla", () => {
    expect(digitando(mascararDocumento, "99900000005")).toBe("999.000.000-05");
    expect(digitando(mascararDocumento, "99999999000191")).toBe("99.999.999/0001-91");
  });
});

describe("CEP e ano", () => {
  it("formata o CEP", () => {
    expect(mascararCep("13970")).toBe("13970");
    expect(mascararCep("13970000")).toBe("13970-000");
    expect(cepValido("13970-000")).toBe(true);
    expect(cepValido("1397000")).toBe(false);
  });

  it("ano tem no maximo quatro digitos", () => {
    expect(mascararAno("2o26x")).toBe("226");
    expect(mascararAno("20261")).toBe("2026");
  });
});

describe("UF", () => {
  it("duas letras maiusculas — digitar o nome do estado e comum", () => {
    expect(mascararUf("sao paulo")).toBe("SA");
    expect(mascararUf("sp")).toBe("SP");
    expect(mascararUf("s1p")).toBe("SP");
  });
});

describe("codigo de apolice, contrato e boleto", () => {
  it("aceita ponto, barra e hifen — cada seguradora numera do seu jeito", () => {
    expect(mascararCodigo("0123.456/78-9")).toBe("0123.456/78-9");
  });

  it("apara o que claramente nao pertence", () => {
    expect(mascararCodigo("ABC#123$")).toBe("ABC123");
    expect(mascararCodigo("A   B")).toBe("A B");
  });
});

describe("e-mail", () => {
  it("tira espaco e caixa alta", () => {
    expect(mascararEmail(" Ana@Exemplo.Test ")).toBe("ana@exemplo.test");
  });

  it("valida o formato", () => {
    expect(emailValido("ana@exemplo.test")).toBe(true);
    expect(emailValido("sem-arroba")).toBe(false);
    expect(emailValido("a@b")).toBe(false);
  });
});

describe("inteiro com sinal", () => {
  it("aceita digito", () => {
    expect(mascararInteiro("30")).toBe("30");
    expect(mascararInteiro("abc12x3")).toBe("123");
  });

  it("PRESERVA o menos — 'prazo vencido' e a regra mais importante da triagem", () => {
    // Uma mascara so de digito apagaria o sinal enquanto a pessoa digita, e
    // "menor que -1" viraria "menor que 1" — o oposto do que ela quis dizer.
    expect(mascararInteiro("-3")).toBe("-3");
    expect(mascararInteiro("-")).toBe("-");
  });

  it("so aceita o menos na frente", () => {
    expect(mascararInteiro("3-")).toBe("3");
    expect(mascararInteiro("1-2")).toBe("12");
  });

  it("campo vazio continua vazio", () => {
    expect(mascararInteiro("")).toBe("");
    expect(mascararInteiro("abc")).toBe("");
  });
});

describe("e-mail em lista", () => {
  it("a mascara preserva a virgula, entao serve para varios destinatarios", () => {
    // O compartilhamento manda para mais de um endereco; se a mascara comesse
    // a virgula, a lista viraria um endereco so, invalido.
    expect(mascararEmail("A@X.com, B@Y.com")).toBe("a@x.com,b@y.com");
  });

  it("tira o espaco que o preenchimento automatico deixa na ponta", () => {
    expect(mascararEmail(" nome@exemplo.test ")).toBe("nome@exemplo.test");
  });
});

describe("valor digitado vira numero", () => {
  it("entende o formato brasileiro e o ponto decimal", () => {
    expect(valorParaNumero("R$ 2.500,00")).toBe(2500);
    expect(valorParaNumero("650,14")).toBe(650.14);
    expect(valorParaNumero("2500.5")).toBe(2500.5);
  });

  it("o que nao e numero vira null, nunca zero", () => {
    expect(valorParaNumero("")).toBeNull();
    expect(valorParaNumero("a combinar")).toBeNull();
  });
});

describe("data dd/mm/aaaa", () => {
  it("mascara progressiva", () => {
    expect(mascararData("12")).toBe("12");
    expect(mascararData("1203")).toBe("12/03");
    expect(mascararData("12031990")).toBe("12/03/1990");
  });
  it("converte e recusa data inexistente", () => {
    expect(dataBrParaIso("12/03/1990")).toBe("1990-03-12");
    expect(dataBrParaIso("29/02/2023")).toBeNull();
    expect(dataBrParaIso("29/02/2024")).toBe("2024-02-29");
    expect(isoParaDataBr("1990-03-12")).toBe("12/03/1990");
  });
});

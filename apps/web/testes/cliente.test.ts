import { describe, expect, it } from "vitest";

import { esquemaCliente, nomeCurto } from "../lib/dominio/cliente";
import { deCanal, paraCanal } from "../lib/dominio/mapear";
import { porCampo, validar } from "../lib/dominio/validar";

const COMPLETO = {
  razaoSocial: "Empresa Exemplo Ltda",
  nomeFantasia: "Empresa Exemplo",
  documento: "99.999.999/0001-91",
  seguradoraId: "3",
  produto: "life",
  observacoes: "",
  informarDia: "8",
  corteDia: "10",
  boletoDia: "16",
  vencimentoDia: "30",
  canal: "whatsapp",
  gestorNome: "Ana Souza",
  gestorCelular: "(11) 95555-0101",
  gestorEmail: "",
};

function erros(entrada: Record<string, unknown>): Record<string, string> {
  const analise = validar(esquemaCliente, entrada);
  return analise.ok ? {} : porCampo(analise.erros);
}

describe("cadastro do cliente", () => {
  it("aceita um cadastro completo e normaliza o que veio da tela", () => {
    const analise = validar(esquemaCliente, COMPLETO);
    expect(analise.ok).toBe(true);
    if (!analise.ok) return;

    // O documento perde a máscara; os dias viram número.
    expect(analise.dados.documento).toBe("99999999000191");
    expect(analise.dados.informarDia).toBe(8);
    expect(analise.dados.vencimentoDia).toBe(30);
    expect(analise.dados.gestorCelular).toBe("11955550101");
  });

  it("campo de texto vazio vira null, e não string vazia", () => {
    const analise = validar(esquemaCliente, { ...COMPLETO, nomeFantasia: "  ", observacoes: "" });
    expect(analise.ok).toBe(true);
    if (!analise.ok) return;
    expect(analise.dados.nomeFantasia).toBeNull();
    expect(analise.dados.observacoes).toBeNull();
    expect(analise.dados.gestorEmail).toBeNull();
  });

  it("recusa CNPJ inválido, e diz qual campo", () => {
    expect(erros({ ...COMPLETO, documento: "11.111.111/1111-11" })).toEqual({
      documento: "CNPJ ou CPF inválido.",
    });
    expect(erros({ ...COMPLETO, documento: "" }).documento).toBe("Informe o CNPJ.");
  });

  it("devolve TODOS os erros de uma vez", () => {
    const lista = erros({ ...COMPLETO, razaoSocial: "x", documento: "123", vencimentoDia: "" });
    expect(Object.keys(lista).sort()).toEqual(["documento", "razaoSocial", "vencimentoDia"]);
  });

  it("dia fora do mês é recusado com o nome do campo", () => {
    expect(erros({ ...COMPLETO, boletoDia: "45" }).boletoDia).toBe("Emissão do boleto: o dia vai de 1 a 31.");
    expect(erros({ ...COMPLETO, boletoDia: "0" }).boletoDia).toBe("Emissão do boleto: o dia vai de 1 a 31.");
  });
});

describe("as regras do mês andam juntas", () => {
  it("apólice sem movimentação deixa informar e corte em branco", () => {
    const analise = validar(esquemaCliente, { ...COMPLETO, informarDia: "", corteDia: "" });
    expect(analise.ok).toBe(true);
    if (!analise.ok) return;
    expect(analise.dados.informarDia).toBeNull();
    expect(analise.dados.corteDia).toBeNull();
  });

  it("uma sem a outra é recusado", () => {
    expect(erros({ ...COMPLETO, corteDia: "" }).corteDia).toMatch(/juntos/);
    expect(erros({ ...COMPLETO, informarDia: "" }).corteDia).toMatch(/juntos/);
  });

  it("boleto e vencimento são sempre obrigatórios", () => {
    expect(erros({ ...COMPLETO, boletoDia: "" }).boletoDia).toBe("Emissão do boleto é obrigatório.");
    expect(erros({ ...COMPLETO, vencimentoDia: "" }).vencimentoDia).toBe("Vencimento é obrigatório.");
  });
});

describe("o canal precisa de por onde falar", () => {
  it("WhatsApp exige celular", () => {
    expect(erros({ ...COMPLETO, canal: "whatsapp", gestorCelular: "" }).gestorCelular).toMatch(/WhatsApp/);
  });

  it("e-mail exige e-mail", () => {
    expect(erros({ ...COMPLETO, canal: "email", gestorCelular: "", gestorEmail: "" }).gestorEmail).toMatch(/e-mail/);
  });

  it("ambos exige os dois", () => {
    const lista = erros({ ...COMPLETO, canal: "ambos", gestorEmail: "" });
    expect(lista.gestorEmail).toMatch(/e-mail/);
    expect(lista.gestorCelular).toBeUndefined();
  });

  it("canal de e-mail não cobra celular", () => {
    const analise = validar(esquemaCliente, {
      ...COMPLETO,
      canal: "email",
      gestorCelular: "",
      gestorEmail: "rh@exemplo.test",
    });
    expect(analise.ok).toBe(true);
  });

  it("celular incompleto é recusado", () => {
    expect(erros({ ...COMPLETO, gestorCelular: "9555" }).gestorCelular).toMatch(/incompleto/);
  });
});

describe("nome curto", () => {
  it("o fantasia vence a razão social", () => {
    expect(nomeCurto({ razaoSocial: "Empresa Exemplo Ltda", nomeFantasia: "Exemplo" })).toBe("Exemplo");
  });

  it("sem fantasia, usa a razão social", () => {
    expect(nomeCurto({ razaoSocial: "Empresa Exemplo Ltda", nomeFantasia: null })).toBe("Empresa Exemplo Ltda");
    expect(nomeCurto({ razaoSocial: "Empresa Exemplo Ltda", nomeFantasia: "   " })).toBe("Empresa Exemplo Ltda");
  });
});

describe("erros por campo", () => {
  it("o primeiro erro de cada campo vence", () => {
    expect(
      porCampo([
        { campo: "documento", mensagem: "primeiro" },
        { campo: "documento", mensagem: "segundo" },
      ]),
    ).toEqual({ documento: "primeiro" });
  });
});

describe("a fronteira com o banco", () => {
  it("o canal viaja traduzido nos dois sentidos", () => {
    // O banco diz `both`, o aplicativo diz `ambos`. Sem a tradução, o cadastro
    // salvaria um valor que o enum do Postgres recusa — e a tela diria só
    // "não foi possível salvar".
    expect(paraCanal("both")).toBe("ambos");
    expect(paraCanal("whatsapp")).toBe("whatsapp");
    expect(paraCanal("email")).toBe("email");
    expect(deCanal("ambos")).toBe("both");
    expect(deCanal("whatsapp")).toBe("whatsapp");
  });

  it("valor desconhecido do banco não vira permissão a mais", () => {
    // Enum novo que o aplicativo ainda não conhece cai no canal mais restrito.
    expect(paraCanal("carta_registrada")).toBe("whatsapp");
  });
});

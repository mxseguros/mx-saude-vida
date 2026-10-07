import { describe, expect, it } from "vitest";

import { esquemaCliente } from "../lib/dominio/cliente";
import { extrairDocumentos } from "../lib/dominio/documento";
import { validar } from "../lib/dominio/validar";

describe("lista colada em lote", () => {
  it("acha CNPJ e CPF com ou sem pontuação, no meio de nomes", () => {
    const texto = "EMPRESA EXEMPLO LTDA\t99.999.999/0001-91\nPESSOA EXEMPLO\t999.999.990-50\nOUTRA\t 99999999000191";
    expect(extrairDocumentos(texto)).toEqual(["99999999000191", "99999999050"]);
  });

  it("ignora número com dígito verificador errado", () => {
    expect(extrairDocumentos("99.999.999/0001-90 e 999.999.990-51")).toEqual([]);
  });
});

describe("cadastro com movimentação própria", () => {
  const base = {
    razaoSocial: "Empresa Exemplo Ltda",
    nomeFantasia: "",
    documento: "99.999.999/0001-91",
    seguradoraId: "",
    produto: "life",
    observacoes: "",
    informarDia: "8",
    corteDia: "10",
    confirmarDia: "",
    boletoDia: "16",
    vencimentoDia: "30",
    acompanhaPagamento: "1",
    canal: "email",
    gestorNome: "",
    gestorCelular: "",
    gestorEmail: "gestor@exemplo.test",
  };

  // Marcado, as datas de coleta somem: o mês começa esperando o boleto.
  it("zera informar, corte e confirmar", () => {
    const r = validar(esquemaCliente, { ...base, movimentacaoPropria: "1" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.dados).toMatchObject({ movimentacaoPropria: true, informarDia: null, corteDia: null, confirmarDia: null });
  });

  it("desmarcado, as datas ficam", () => {
    const r = validar(esquemaCliente, { ...base, movimentacaoPropria: "" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.dados).toMatchObject({ movimentacaoPropria: false, informarDia: 8, corteDia: 10 });
  });
});

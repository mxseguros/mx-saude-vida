import { describe, expect, it } from "vitest";

import { contarUrgentes, montarAlertas, type MesParaAlerta } from "../lib/dominio/alerta";

const HOJE = "2026-09-22";

const mes = (troca: Partial<MesParaAlerta> = {}): MesParaAlerta => ({
  id: "m1",
  competencia: "2026-09",
  cliente: "Cliente A",
  seguradora: "Seguradora X",
  analista: null,
  passo: "informar",
  datas: { informar: "2026-09-08", corte: "2026-09-24", boleto: "2026-09-26", vencimento: "2026-10-10" },
  acompanhaPagamento: true,
  reenviou: false,
  ...troca,
});

describe("alertas de prazo", () => {
  it("informar vencido é atrasado, com o botão de enviar o link", () => {
    const [a] = montarAlertas([mes()], HOJE);
    expect(a).toMatchObject({ grupo: "atrasado", detalhe: "era 08/09 · Seguradora X" });
    expect(a?.acao).toEqual({ rotulo: "Enviar link", href: "/controle/m1/coleta" });
  });

  it("corte em 2 dias entra em próximos; boleto em 4 dias não", () => {
    const grupos = montarAlertas([mes({ passo: "planilha_recebida" })], HOJE).map((a) => [a.grupo, a.titulo]);
    expect(grupos).toContainEqual(["perto", "Corte em 2 dias · Cliente A"]);
    expect(grupos.some(([, t]) => t?.startsWith("Gerar o boleto"))).toBe(false);
  });

  it("planilha recebida vai para validar, com Conferir", () => {
    const validar = montarAlertas([mes({ passo: "planilha_recebida" })], HOJE).filter((a) => a.grupo === "validar");
    expect(validar).toHaveLength(1);
    expect(validar[0]?.acao.href).toBe("/controle/m1/conferir");
  });

  it("reenvio depois da conferência vai para validar", () => {
    const [a] = montarAlertas([mes({ passo: "boleto", reenviou: true, datas: { ...mes().datas, vencimento: "2026-12-10" } })], HOJE);
    expect(a?.titulo).toMatch(/reenviou/);
  });

  // O cron avança o passo no dia do corte: alertar seria pedir trabalho que não existe.
  it("corte de mês conferido não alerta", () => {
    expect(montarAlertas([mes({ passo: "conferida" })], HOJE).some((a) => a.titulo.startsWith("Corte"))).toBe(false);
  });

  it("o que foi feito some", () => {
    expect(montarAlertas([mes({ passo: "concluida" })], HOJE)).toEqual([]);
  });

  it("vencimento hoje sem acompanhar pagamento não alerta", () => {
    const m = mes({ passo: "boleto", acompanhaPagamento: false, datas: { ...mes().datas, vencimento: HOJE } });
    expect(montarAlertas([m], HOJE)).toEqual([]);
  });

  it("ordena atrasado, hoje, próximos, validar; o sino conta atrasados e hoje", () => {
    const lista = montarAlertas(
      [mes({ id: "m1" }), mes({ id: "m2", passo: "planilha_recebida", datas: { ...mes().datas, corte: HOJE } })],
      HOJE,
    );
    expect(lista.map((a) => a.grupo)).toEqual(["atrasado", "hoje", "perto", "validar"]);
    expect(contarUrgentes(lista)).toEqual({ urgentes: 2, atrasados: 1 });
  });
});

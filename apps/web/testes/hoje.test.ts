import { describe, expect, it } from "vitest";

import { competenciaDeHoje, hojeSaoPaulo } from "../lib/dominio/hoje";

/**
 * O fuso é o ponto todo deste módulo.
 *
 * A Vercel roda em UTC. Às 21h de São Paulo já é o dia seguinte lá, e um prazo
 * que vence hoje apareceria vermelho de "vencido" na tela da analista — alerta
 * falso, todo fim de tarde, até ninguém mais olhar para o vermelho.
 */

describe("hojeSaoPaulo", () => {
  it("formata AAAA-MM-DD, que é o que o resto do sistema compara", () => {
    expect(hojeSaoPaulo(new Date("2026-09-28T12:00:00Z"))).toBe("2026-09-28");
  });

  it("às 21h de São Paulo (00h UTC do dia seguinte) ainda é o dia de cá", () => {
    // 2026-09-29T00:30Z = 28/09 às 21h30 em São Paulo (UTC-3).
    expect(hojeSaoPaulo(new Date("2026-09-29T00:30:00Z"))).toBe("2026-09-28");
  });

  it("à meia-noite e um de São Paulo já é o dia novo", () => {
    expect(hojeSaoPaulo(new Date("2026-09-29T03:01:00Z"))).toBe("2026-09-29");
  });

  it("a virada do mês acompanha o fuso", () => {
    // 01/10 às 00h30 UTC = 30/09 às 21h30 em São Paulo: a competência ainda é
    // setembro, e o cron das 07h BRT não abre outubro cedo demais.
    expect(hojeSaoPaulo(new Date("2026-10-01T00:30:00Z"))).toBe("2026-09-30");
  });

  it("a virada do ano também", () => {
    expect(hojeSaoPaulo(new Date("2027-01-01T01:00:00Z"))).toBe("2026-12-31");
  });

  it("dia e mês vêm com dois dígitos", () => {
    expect(hojeSaoPaulo(new Date("2026-01-05T15:00:00Z"))).toBe("2026-01-05");
  });
});

describe("competenciaDeHoje", () => {
  it("é AAAA-MM", () => {
    expect(competenciaDeHoje(new Date("2026-09-28T12:00:00Z"))).toBe("2026-09");
  });

  it("segue o mesmo fuso do dia", () => {
    expect(competenciaDeHoje(new Date("2026-10-01T00:30:00Z"))).toBe("2026-09");
    expect(competenciaDeHoje(new Date("2026-10-01T12:00:00Z"))).toBe("2026-10");
  });
});

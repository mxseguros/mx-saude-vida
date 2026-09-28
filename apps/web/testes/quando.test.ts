import { describe, expect, it } from "vitest";

import { descreverQuando } from "../lib/dominio/quando";

// 17/09/2026 14:00 em São Paulo = 17:00Z.
const AGORA = new Date("2026-09-17T17:00:00Z");

describe("descreverQuando (17/09)", () => {
  it("hoje, ontem e data, no fuso de São Paulo", () => {
    expect(descreverQuando("2026-09-17T12:42:00Z", AGORA)).toBe("hoje às 09:42");
    expect(descreverQuando("2026-09-16T20:42:00Z", AGORA)).toBe("ontem às 17:42");
    expect(descreverQuando("2026-09-10T20:42:00Z", AGORA)).toBe("em 10/09 às 17:42");
  });

  it("a virada do dia é a de São Paulo, não a de UTC", () => {
    // 02:30Z de 17/09 ainda é 23:30 de 16/09 em São Paulo: ontem.
    expect(descreverQuando("2026-09-17T02:30:00Z", AGORA)).toBe("ontem às 23:30");
  });

  it("data inválida vira vazio, nunca 'Invalid Date'", () => {
    expect(descreverQuando("x", AGORA)).toBe("");
  });
});

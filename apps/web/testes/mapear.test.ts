import { describe, expect, it } from "vitest";

import { PASSOS, type ModeloDeMensagem, type Passo } from "../lib/dominio/controle";
import { CANAIS } from "../lib/dominio/cliente";
import {
  deCanal,
  deModelo,
  dePapel,
  dePasso,
  paraCanal,
  paraModelo,
  paraPapel,
  paraPasso,
  paraPessoa,
} from "../lib/dominio/mapear";
import type { Papel } from "../lib/dominio/tipos";

/**
 * A fronteira banco↔aplicativo.
 *
 * Duas coisas importam aqui e o resto é consequência: ida e volta não pode
 * perder informação, e valor desconhecido tem que cair no lado seguro. Um enum
 * novo no banco chega a este arquivo antes de chegar ao resto do sistema.
 */

const MODELOS: ModeloDeMensagem[] = ["informar", "corte", "boleto", "vencimento", "correcao"];
const PAPEIS: Papel[] = ["admin", "analista", "leitura"];

describe("ida e volta não perde informação", () => {
  it("papel", () => {
    for (const papel of PAPEIS) expect(paraPapel(dePapel(papel))).toBe(papel);
  });

  it("canal", () => {
    for (const canal of CANAIS) expect(paraCanal(deCanal(canal))).toBe(canal);
  });

  it("passo", () => {
    for (const passo of PASSOS) expect(paraPasso(dePasso(passo))).toBe(passo);
  });

  it("modelo de mensagem", () => {
    for (const modelo of MODELOS) expect(paraModelo(deModelo(modelo))).toBe(modelo);
  });
});

describe("valor desconhecido cai no lado seguro", () => {
  // Enum novo no banco não pode virar permissão a mais...
  it("papel vira leitura", () => {
    expect(paraPapel("superuser")).toBe("leitura");
    expect(paraPapel("")).toBe("leitura");
  });

  // ...nem tirar um cliente da fila do mês.
  it("passo vira informar", () => {
    expect(paraPasso("cancelled")).toBe("informar");
    expect(paraPasso("")).toBe("informar");
  });

  it("modelo vira informar", () => {
    expect(paraModelo("renewal")).toBe("informar");
  });

  // Canal desconhecido vira whatsapp porque é o canal que a analista dispara
  // no clique: no pior caso alguém vê a janela abrir e fecha, contra um e-mail
  // que sai sozinho sem ninguém conferir.
  it("canal vira whatsapp", () => {
    expect(paraCanal("sms")).toBe("whatsapp");
  });
});

describe("tradução dos nomes que divergem", () => {
  it("both ↔ ambos", () => {
    expect(paraCanal("both")).toBe("ambos");
    expect(deCanal("ambos")).toBe("both");
  });

  it("spreadsheet_received ↔ planilha_recebida", () => {
    expect(paraPasso("spreadsheet_received")).toBe("planilha_recebida");
    expect(dePasso("planilha_recebida")).toBe("spreadsheet_received");
  });

  it("correction ↔ correcao", () => {
    expect(paraModelo("correction")).toBe("correcao");
    expect(deModelo("correcao")).toBe("correction");
  });

  it("analyst ↔ analista", () => {
    expect(paraPapel("analyst")).toBe("analista");
    expect(dePapel("analista")).toBe("analyst");
  });
});

describe("pessoa da equipe", () => {
  it("linha ausente devolve nulo, em vez de uma pessoa vazia", () => {
    expect(paraPessoa(null)).toBeNull();
  });

  it("sem iniciais no banco, a interrogação segura o avatar", () => {
    const pessoa = paraPessoa({ id: "u1", full_name: "Equipe MX", initials: null, role: "analyst" });
    expect(pessoa).toEqual({ id: "u1", nome: "Equipe MX", iniciais: "?", papel: "analista" });
  });
});

describe("dePasso cobre todos os passos", () => {
  // Sem isto, um passo novo no aplicativo viraria `undefined` no update e o
  // banco recusaria a escrita só em produção.
  it("nenhum passo devolve undefined", () => {
    for (const passo of PASSOS) expect(typeof dePasso(passo as Passo)).toBe("string");
  });
});

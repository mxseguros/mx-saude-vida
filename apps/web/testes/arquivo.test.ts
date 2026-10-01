import { describe, expect, it } from "vitest";

import {
  TAMANHO_MAXIMO,
  caminhoDoArquivo,
  conferirArquivo,
  emMegabytes,
  extensaoDe,
  nomeSeguro,
} from "../lib/dominio/arquivo";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

describe("conferirArquivo", () => {
  it("aceita a planilha do mês nos formatos que o cliente usa", () => {
    expect(conferirArquivo("vidas.xlsx", 1024, XLSX, "planilha")).toBeNull();
    expect(conferirArquivo("vidas.csv", 1024, "text/csv", "planilha")).toBeNull();
    expect(conferirArquivo("relacao.pdf", 1024, "application/pdf", "planilha")).toBeNull();
  });

  it("arquivo vazio fala de salvamento, não de bytes", () => {
    const problema = conferirArquivo("vidas.xlsx", 0, XLSX, "planilha");
    expect(problema?.tipo).toBe("vazio");
    expect(problema?.mensagem).toContain("salvamento");
  });

  it("acima do teto, a mensagem diz o tamanho e o limite em MB", () => {
    const problema = conferirArquivo("vidas.xlsx", TAMANHO_MAXIMO + 1, XLSX, "planilha");
    expect(problema?.tipo).toBe("grande");
    expect(problema?.mensagem).toContain("20,0 MB");
  });

  it("imagem não é planilha", () => {
    expect(conferirArquivo("foto.png", 1024, "image/png", "planilha")?.tipo).toBe("formato");
  });

  /**
   * O `type` de um File vem do sistema operacional e chega vazio com
   * frequência — planilha vinda do Drive no celular é o caso comum. Recusar por
   * MIME vazio barraria gente com arquivo bom.
   */
  it("MIME vazio com extensão certa passa", () => {
    expect(conferirArquivo("vidas.xlsx", 1024, "", "planilha")).toBeNull();
  });

  it("MIME certo sem extensão no nome passa", () => {
    expect(conferirArquivo("planilha-do-mes", 1024, XLSX, "planilha")).toBeNull();
  });

  it("sem extensão e sem MIME, recusa", () => {
    expect(conferirArquivo("arquivo", 1024, "", "planilha")?.tipo).toBe("formato");
  });

  it("boleto e apólice são PDF e nada mais", () => {
    expect(conferirArquivo("boleto.pdf", 1024, "application/pdf", "boleto")).toBeNull();
    expect(conferirArquivo("boleto.xlsx", 1024, XLSX, "boleto")?.tipo).toBe("formato");
    expect(conferirArquivo("apolice.pdf", 1024, "application/pdf", "apolice")).toBeNull();
  });

  it("extensão em maiúscula serve", () => {
    expect(conferirArquivo("VIDAS.XLSX", 1024, "", "planilha")).toBeNull();
  });
});

describe("nomeSeguro", () => {
  it("tira acento e espaço", () => {
    expect(nomeSeguro("relação de vidas.xlsx")).toBe("relacao-de-vidas.xlsx");
  });

  /**
   * `../` num nome de arquivo é travessia de diretório: sem isto, um nome
   * forjado escaparia da pasta do cliente — que é justamente o primeiro nível
   * que a política do Storage confere.
   */
  it("não deixa escapar da pasta", () => {
    const limpo = nomeSeguro("../../outro-cliente/segredo.xlsx");
    expect(limpo).not.toContain("/");
    expect(limpo.startsWith(".")).toBe(false);
  });

  it("nome que vira nada ganha um padrão, em vez de chave vazia", () => {
    expect(nomeSeguro("///")).toBe("arquivo");
    expect(nomeSeguro("")).toBe("arquivo");
  });

  it("corta nome gigante", () => {
    expect(nomeSeguro(`${"a".repeat(400)}.xlsx`).length).toBeLessThanOrEqual(120);
  });
});

describe("caminhoDoArquivo", () => {
  /**
   * A PRIMEIRA PASTA É O `client_id`, e isso não é organização: é a política do
   * Storage. `client_files_own_read` compara `foldername(name)[1]` com
   * `client_id_of_user()`. Trocar a ordem aqui abre o bucket.
   */
  it("começa pelo client_id", () => {
    const caminho = caminhoDoArquivo("cli-1", "2026-09", "vidas.xlsx", "uuid-1");
    expect(caminho.split("/")[0]).toBe("cli-1");
    expect(caminho).toBe("cli-1/2026-09/uuid-1-vidas.xlsx");
  });

  it("nome hostil não muda o primeiro nível", () => {
    const caminho = caminhoDoArquivo("cli-1", "2026-09", "../../outro/x.xlsx", "uuid-1");
    expect(caminho.split("/")[0]).toBe("cli-1");
    expect(caminho.split("/")).toHaveLength(3);
  });
});

describe("auxiliares", () => {
  it("extensaoDe pega a última e devolve em minúscula", () => {
    expect(extensaoDe("a.b.XLSX")).toBe(".xlsx");
    expect(extensaoDe("sem-ponto")).toBe("");
  });

  it("emMegabytes usa vírgula, como se escreve em português", () => {
    expect(emMegabytes(1024 * 1024)).toBe("1,0 MB");
  });
});

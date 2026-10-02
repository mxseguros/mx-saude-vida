import "server-only";

import { extractText, getDocumentProxy } from "unpdf";

import { lerBoleto, type CamposDoBoleto } from "../dominio/boleto";
import { registrarLog } from "../log";

/**
 * O PDF do boleto, lido no servidor.
 *
 * Aqui mora o I/O — abrir o arquivo e tirar o texto. A interpretação do texto é
 * do módulo puro `lib/dominio/boleto.ts`, que tem teste e não sabe o que é um
 * PDF. A divisão é o que permite provar a leitura contra um boleto real sem
 * precisar de arquivo nenhum na suíte de testes.
 */

/** Teto de páginas. Boleto tem uma; dezenas significam que não é boleto. */
const PAGINAS_DEMAIS = 5;

export type LeituraDoBoleto = CamposDoBoleto & { paginas: number };

/**
 * Nunca lança.
 *
 * PDF protegido, digitalizado sem texto ou corrompido é caso comum — a
 * seguradora manda o que manda. Quando a leitura falha, a resposta é "preencha
 * à mão" e o formulário abre vazio; derrubar a rota faria a analista achar que
 * o sistema está fora do ar.
 */
export async function lerPdfDoBoleto(arquivo: File, hoje: string): Promise<LeituraDoBoleto> {
  const vazio: LeituraDoBoleto = {
    valor: null,
    vencimento: null,
    parcela: null,
    linhaDigitavel: null,
    confianca: "nenhuma",
    avisos: ["Não consegui ler este PDF. Preencha os campos à mão."],
    paginas: 0,
  };

  try {
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const pdf = await getDocumentProxy(bytes);
    const { totalPages, text } = await extractText(pdf, { mergePages: true });

    if (totalPages > PAGINAS_DEMAIS) {
      return {
        ...vazio,
        paginas: totalPages,
        avisos: [`Este PDF tem ${totalPages} páginas. Confirme que é o boleto e preencha à mão.`],
      };
    }

    // PDF digitalizado vem sem camada de texto: o extrator devolve quase nada.
    if (text.trim().length < 40) {
      return {
        ...vazio,
        paginas: totalPages,
        avisos: ["Este PDF parece ser uma imagem digitalizada. Preencha os campos à mão."],
      };
    }

    return { ...lerBoleto(text, hoje), paginas: totalPages };
  } catch (erro) {
    // O log leva o tipo do erro, nunca o conteúdo: o texto do boleto tem o nome
    // e o CNPJ do segurado.
    registrarLog("erro", "boleto.leitura", {
      codigo: erro instanceof Error ? erro.name : "desconhecido",
    });
    return vazio;
  }
}

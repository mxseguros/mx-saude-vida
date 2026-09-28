import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verificação de assinatura no padrão Standard Webhooks — o que o Supabase
 * usa nos ganchos de autenticação (o "Send Email hook").
 *
 * O segredo vem como `v1,whsec_<base64>`. A assinatura é
 * `base64(HMAC-SHA256(segredo, "<id>.<timestamp>.<corpo>"))`, e o cabeçalho
 * `webhook-signature` pode trazer várias, separadas por espaço, cada uma
 * como `v1,<base64>` — é assim que rotação de segredo funciona sem janela
 * de falha.
 *
 * Duas coisas que precisam estar certas aqui:
 *   - a comparação é de tempo constante: comparar com `===` vaza o prefixo
 *     correto pela diferença de tempo de resposta;
 *   - o timestamp tem tolerância de 5 minutos, para um pedido capturado não
 *     poder ser reenviado amanhã.
 *
 * Puro: o relógio entra como parâmetro. Sem I/O.
 */

export const TOLERANCIA_SEGUNDOS = 300;

export type Cabecalhos = {
  id: string | null;
  timestamp: string | null;
  assinatura: string | null;
};

export type Verificacao =
  | { ok: true }
  | { ok: false; motivo: "cabecalho" | "segredo" | "fora_do_tempo" | "assinatura" };

/** `v1,whsec_abc...` ou `whsec_abc...` → bytes do segredo. */
export function decodificarSegredo(segredo: string): Buffer | null {
  const semVersao = segredo.trim().replace(/^v1,/, "");
  if (!semVersao.startsWith("whsec_")) return null;
  const base64 = semVersao.slice("whsec_".length);
  if (!base64) return null;
  try {
    return Buffer.from(base64, "base64");
  } catch {
    return null;
  }
}

export function assinar(segredo: Buffer, id: string, timestamp: string, corpo: string): string {
  return createHmac("sha256", segredo).update(`${id}.${timestamp}.${corpo}`).digest("base64");
}

export function verificarAssinatura(
  cabecalhos: Cabecalhos,
  corpo: string,
  segredo: string,
  agoraSegundos: number = Math.floor(Date.now() / 1000),
): Verificacao {
  const { id, timestamp, assinatura } = cabecalhos;
  if (!id || !timestamp || !assinatura) return { ok: false, motivo: "cabecalho" };

  const bytes = decodificarSegredo(segredo);
  if (!bytes) return { ok: false, motivo: "segredo" };

  const quando = Number(timestamp);
  if (!Number.isFinite(quando) || Math.abs(agoraSegundos - quando) > TOLERANCIA_SEGUNDOS) {
    return { ok: false, motivo: "fora_do_tempo" };
  }

  const esperada = Buffer.from(assinar(bytes, id, timestamp, corpo));

  for (const parte of assinatura.split(/\s+/)) {
    const [versao, valor] = parte.split(",", 2);
    if (versao !== "v1" || !valor) continue;
    const recebida = Buffer.from(valor);
    if (recebida.length === esperada.length && timingSafeEqual(recebida, esperada)) {
      return { ok: true };
    }
  }

  return { ok: false, motivo: "assinatura" };
}

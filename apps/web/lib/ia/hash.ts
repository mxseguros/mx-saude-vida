import "server-only";

import { createHash } from "node:crypto";

/**
 * Impressao digital do arquivo enviado.
 *
 * SHA-256 do CONTEUDO, nao do nome: a analista salva a mesma apolice como
 * "apolice.pdf", "apolice (1).pdf" e "Porto 2026.pdf", e as tres sao o mesmo
 * documento. Pelo nome, o cache erraria os tres casos.
 */
export function hashDoArquivo(conteudo: Buffer): string {
  return createHash("sha256").update(conteudo).digest("hex");
}

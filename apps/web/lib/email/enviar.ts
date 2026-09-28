import "server-only";

import { enviarPeloGraph } from "./graph";
import { escolherProvedor } from "./provedor";
import { enviarPeloResend } from "./resend";
import type { Mensagem, ResultadoEmail } from "./tipos";

export type { Mensagem, ResultadoEmail } from "./tipos";

/**
 * Envio de e-mail transacional — a porta única que o resto do sistema chama.
 *
 * Quem decide o provedor é `escolherProvedor`, pelas variáveis de ambiente:
 * Microsoft Graph com a caixa da MX (decisão de 11/09) ou a API do Resend. Nenhum configurado → `sem_provedor`, e o histórico registra que
 * não enviou.
 *
 * NUNCA LANÇA. O e-mail é consequência de uma ação (compartilhar um ticket,
 * mover de etapa), não condição dela: uma exceção aqui derrubaria a mudança
 * de status que já foi gravada.
 */
export async function enviarEmail(mensagem: Mensagem): Promise<ResultadoEmail> {
  const provedor = escolherProvedor(process.env);

  if (!provedor) {
    return {
      ok: false,
      codigo: "sem_provedor",
      mensagem:
        "O envio de e-mail não está configurado. Avise o administrador do sistema.",
    };
  }

  if (mensagem.para.length === 0) {
    return { ok: false, codigo: "recusado", mensagem: "Nenhum destinatário." };
  }

  switch (provedor.tipo) {
    case "graph":
      return enviarPeloGraph(provedor, mensagem);
    case "resend":
      return enviarPeloResend(provedor, mensagem);
  }
}

/** A tela usa isto para explicar antes de tentar, em vez de falhar depois. */
export function emailConfigurado(): boolean {
  return escolherProvedor(process.env) !== null;
}

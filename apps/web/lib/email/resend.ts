import "server-only";

import type { ProvedorResend } from "./provedor";
import type { Mensagem, ResultadoEmail } from "./tipos";

/**
 * Envio pela API HTTP do Resend — a alternativa ao SMTP da caixa da MX.
 *
 * Sem SDK: é uma chamada `fetch` com quatro campos, e uma dependência a mais
 * no bundle do servidor por causa disso não se paga.
 *
 * NUNCA LANÇA e NUNCA LOGA o corpo — ver `enviar.ts`.
 */

const LIMITE_MS = 10_000;

export async function enviarPeloResend(
  provedor: ProvedorResend,
  mensagem: Mensagem,
): Promise<ResultadoEmail> {
  try {
    const resposta = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provedor.chave}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: provedor.remetente,
        to: mensagem.para,
        subject: mensagem.assunto,
        html: mensagem.html,
        text: mensagem.texto,
        reply_to: mensagem.responderPara ?? provedor.responderPara ?? undefined,
      }),
      // Sem timeout, a rota fica pendurada e a analista não sabe se enviou.
      signal: AbortSignal.timeout(LIMITE_MS),
    });

    if (!resposta.ok) {
      // Só o motivo, nunca o corpo que enviamos. O Resend devolve mensagens
      // úteis ("domain is not verified"), e elas ajudam o administrador.
      const corpo = (await resposta.json().catch(() => null)) as
        | { message?: string; name?: string }
        | null;

      return {
        ok: false,
        codigo: "recusado",
        mensagem: corpo?.message
          ? `O provedor recusou: ${corpo.message}`
          : `O provedor recusou o envio (HTTP ${resposta.status}).`,
      };
    }

    const corpo = (await resposta.json()) as { id?: string };
    return { ok: true, id: corpo.id ?? "" };
  } catch (erro) {
    const nome = (erro as Error)?.name;
    return {
      ok: false,
      codigo: "rede",
      mensagem:
        nome === "TimeoutError" || nome === "AbortError"
          ? "O provedor de e-mail não respondeu a tempo."
          : "Não foi possível falar com o provedor de e-mail.",
    };
  }
}

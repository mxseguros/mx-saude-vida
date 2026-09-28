import "server-only";

import type { ProvedorGraph } from "./provedor";
import type { Mensagem, ResultadoEmail } from "./tipos";

/**
 * Envio pela API do Microsoft Graph — a caixa da MX no Microsoft 365, sem
 * SMTP e sem senha de caixa.
 *
 * Autenticação de aplicativo (client credentials): o registro no Entra ID
 * tem a permissão `Mail.Send` de APLICATIVO, e envia como qualquer caixa do
 * tenant — por isso o administrador deve restringir com uma Application
 * Access Policy à caixa de sistemas. Aqui, a URL do envio já fixa a caixa:
 * `/users/{caixa}/sendMail`.
 *
 * O token de acesso vale cerca de uma hora e é guardado no módulo com folga
 * de um minuto: pedir token a cada e-mail dobraria as chamadas e o tempo.
 *
 * NUNCA LANÇA e NUNCA LOGA o corpo — ver `enviar.ts`.
 */

const LIMITE_MS = 10_000;
const FOLGA_MS = 60_000;

let tokenGuardado: { valor: string; expiraEm: number; chave: string } | null = null;

async function tokenDeAcesso(p: ProvedorGraph): Promise<{ ok: true; token: string } | { ok: false; mensagem: string }> {
  const chave = `${p.tenant}:${p.clientId}`;
  if (tokenGuardado && tokenGuardado.chave === chave && tokenGuardado.expiraEm > Date.now()) {
    return { ok: true, token: tokenGuardado.valor };
  }

  const resposta = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(p.tenant)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: p.clientId,
        client_secret: p.segredo,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
      signal: AbortSignal.timeout(LIMITE_MS),
    },
  );

  const corpo = (await resposta.json().catch(() => null)) as
    | { access_token?: string; expires_in?: number; error?: string; error_description?: string }
    | null;

  if (!resposta.ok || !corpo?.access_token) {
    // `error` é um código curto (invalid_client, unauthorized_client); a
    // descrição da Microsoft é longa e traz um ID de rastreio — só o código
    // basta ao administrador, e não vaza nada.
    return {
      ok: false,
      mensagem: `A Microsoft recusou o aplicativo (${corpo?.error ?? `HTTP ${resposta.status}`}). Confira MS_TENANT_ID, MS_CLIENT_ID e MS_CLIENT_SECRET.`,
    };
  }

  tokenGuardado = {
    valor: corpo.access_token,
    expiraEm: Date.now() + (corpo.expires_in ?? 3600) * 1000 - FOLGA_MS,
    chave,
  };
  return { ok: true, token: corpo.access_token };
}

export async function enviarPeloGraph(
  provedor: ProvedorGraph,
  mensagem: Mensagem,
): Promise<ResultadoEmail> {
  try {
    const token = await tokenDeAcesso(provedor);
    if (!token.ok) return { ok: false, codigo: "recusado", mensagem: token.mensagem };

    const responderPara = mensagem.responderPara ?? provedor.responderPara;

    const resposta = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(provedor.caixa)}/sendMail`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            subject: mensagem.assunto,
            body: { contentType: "HTML", content: mensagem.html },
            toRecipients: mensagem.para.map((address) => ({ emailAddress: { address } })),
            ...(responderPara ? { replyTo: [{ emailAddress: { address: responderPara } }] } : {}),
          },
          // Fica em "Itens enviados" da caixa: a equipe consegue ver o que o
          // sistema mandou sem abrir o sistema.
          saveToSentItems: true,
        }),
        signal: AbortSignal.timeout(LIMITE_MS),
      },
    );

    // 202 Accepted é o sucesso do sendMail. Não há id de mensagem na resposta.
    if (resposta.status === 202) return { ok: true, id: "" };

    const corpo = (await resposta.json().catch(() => null)) as
      | { error?: { code?: string; message?: string } }
      | null;
    const codigo = corpo?.error?.code ?? `HTTP ${resposta.status}`;

    // 401/403: token sem permissão ou caixa fora da política de acesso —
    // configuração, não este e-mail. 404: a caixa não existe no tenant.
    const dica =
      resposta.status === 403
        ? " O aplicativo não tem Mail.Send, ou a política de acesso não inclui esta caixa."
        : resposta.status === 404
          ? " A caixa do remetente não existe neste tenant."
          : "";

    return { ok: false, codigo: "recusado", mensagem: `A Microsoft recusou o envio (${codigo}).${dica}` };
  } catch (erro) {
    const nome = (erro as Error)?.name;
    return {
      ok: false,
      codigo: "rede",
      mensagem:
        nome === "TimeoutError" || nome === "AbortError"
          ? "A Microsoft não respondeu a tempo."
          : "Não foi possível falar com a Microsoft.",
    };
  }
}

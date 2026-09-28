import { escaparHtml } from "./email";

/**
 * Os e-mails de autenticação — magic link, convite, recuperação de senha,
 * troca de e-mail — escritos por nós e enviados pela caixa da MX.
 *
 * Por que existem: o Supabase manda esses e-mails pelo SMTP dele, que
 * permite ~2 envios por hora e travou a equipe no MX Leads. Com o "Send
 * Email hook", o Supabase para de enviar e chama a nossa rota, que envia
 * pelo mesmo caminho do resto do sistema (Microsoft Graph). Um provedor só.
 *
 * O link é o de verificação do próprio Supabase: ele confere o token, cria a
 * sessão e redireciona para o `redirect_to` que o formulário pediu (o nosso
 * `/auth/confirmar?destino=...`). Não reinventamos a verificação.
 *
 * Puro: só texto. Testado.
 */

export const TIPOS = [
  "magiclink",
  "signup",
  "invite",
  "recovery",
  "email_change",
  "reauthentication",
] as const;

export type TipoDeEmailAuth = (typeof TIPOS)[number];

export function tipoConhecido(valor: unknown): valor is TipoDeEmailAuth {
  return typeof valor === "string" && (TIPOS as readonly string[]).includes(valor);
}

/**
 * `https://<ref>.supabase.co/auth/v1/verify?token=<hash>&type=<tipo>&redirect_to=<url>`
 *
 * A barra final da base é removida antes de juntar, como em `linkDoConvite`:
 * a variável às vezes vem com ela e o resultado teria `//auth`.
 */
export function urlDeVerificacao(
  baseSupabase: string,
  tokenHash: string,
  tipo: TipoDeEmailAuth,
  redirectTo: string,
): string {
  const base = baseSupabase.replace(/\/+$/, "");
  const q = new URLSearchParams({ token: tokenHash, type: tipo, redirect_to: redirectTo });
  return `${base}/auth/v1/verify?${q.toString()}`;
}

type Textos = { assunto: string; chamada: string; botao: string; aviso: string };

const TEXTOS: Record<TipoDeEmailAuth, Textos> = {
  magiclink: {
    assunto: "Seu acesso ao MX SaúdeVida",
    chamada: "Clique no botão para entrar no MX SaúdeVida. Não precisa de senha.",
    botao: "Entrar no MX SaúdeVida",
    aviso: "O link vale por pouco tempo e funciona uma vez só. Se você não pediu para entrar, ignore este e-mail.",
  },
  signup: {
    assunto: "Confirme seu e-mail no MX SaúdeVida",
    chamada: "Confirme seu e-mail para ativar o acesso ao MX SaúdeVida.",
    botao: "Confirmar e-mail",
    aviso: "Se você não criou este acesso, ignore este e-mail.",
  },
  invite: {
    assunto: "Você foi convidado para o MX SaúdeVida",
    chamada: "A MX Corretora de Seguros abriu um acesso para você no sistema de seguros saúde e vida. Clique para aceitar e definir sua senha.",
    botao: "Aceitar o convite",
    aviso: "O link vale por pouco tempo. Se não esperava este convite, ignore este e-mail.",
  },
  recovery: {
    assunto: "Redefinir sua senha do MX SaúdeVida",
    chamada: "Recebemos um pedido para redefinir a sua senha. Clique para escolher uma nova.",
    botao: "Redefinir senha",
    aviso: "Se você não pediu isso, ignore este e-mail — a sua senha continua a mesma.",
  },
  email_change: {
    assunto: "Confirme a troca de e-mail no MX SaúdeVida",
    chamada: "Confirme que este é o seu novo e-mail de acesso ao MX SaúdeVida.",
    botao: "Confirmar novo e-mail",
    aviso: "Se você não pediu esta troca, ignore este e-mail e avise o administrador.",
  },
  reauthentication: {
    assunto: "Confirme que é você — MX SaúdeVida",
    chamada: "Para continuar, digite este código no MX SaúdeVida:",
    botao: "",
    aviso: "O código vale por pouco tempo. Se você não pediu isso, ignore este e-mail.",
  },
};

export type MensagemAuth = { assunto: string; texto: string; html: string };

/**
 * Monta a mensagem. `reauthentication` não tem link — é só o código de seis
 * dígitos; os outros levam o botão e, abaixo, o link em texto para quem não
 * consegue clicar.
 */
export function mensagemDeAutenticacao(
  tipo: TipoDeEmailAuth,
  dados: { url: string; codigo?: string },
): MensagemAuth {
  const t = TEXTOS[tipo];
  const e = escaparHtml;

  if (tipo === "reauthentication") {
    const codigo = dados.codigo ?? "";
    return {
      assunto: t.assunto,
      texto: `${t.chamada}\n\n${codigo}\n\n${t.aviso}\n\nMX Corretora de Seguros`,
      html: moldura(`
        <p style="margin:0 0 16px">${e(t.chamada)}</p>
        <p style="margin:0 0 20px;font-size:28px;letter-spacing:.2em;font-weight:700">${e(codigo)}</p>
        <p style="margin:0;color:#55687E;font-size:13px">${e(t.aviso)}</p>`),
    };
  }

  return {
    assunto: t.assunto,
    texto: `${t.chamada}\n\n${dados.url}\n\n${t.aviso}\n\nMX Corretora de Seguros`,
    html: moldura(`
      <p style="margin:0 0 20px">${e(t.chamada)}</p>
      <p style="margin:0 0 20px"><a href="${e(dados.url)}" style="display:inline-block;background:#071B34;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600">${e(t.botao)}</a></p>
      <p style="margin:0 0 16px;color:#55687E;font-size:13px">Se o botão não abrir, copie este endereço no navegador:<br><span style="word-break:break-all">${e(dados.url)}</span></p>
      <p style="margin:0;color:#55687E;font-size:13px">${e(t.aviso)}</p>`),
  };
}

function moldura(miolo: string): string {
  return `<!doctype html>
<html lang="pt-BR"><body style="margin:0;background:#F2F5FA;font-family:ui-sans-serif,system-ui,'Segoe UI',sans-serif;color:#0A1A2E">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border:1px solid #D9E2ED;border-radius:10px">
<tr><td style="padding:20px 24px;background:#071B34;color:#fff;font-weight:800;font-size:16px;border-radius:10px 10px 0 0">MX SaúdeVida</td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.6">${miolo}</td></tr>
<tr><td style="padding:14px 24px;color:#8395A8;font-size:12px;border-top:1px solid #D9E2ED">MX Corretora de Seguros · e-mail automático, não responda.</td></tr>
</table></td></tr></table></body></html>`;
}

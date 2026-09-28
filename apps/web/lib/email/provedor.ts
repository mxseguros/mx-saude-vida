/**
 * Qual provedor de e-mail está configurado — decidido pelas variáveis de
 * ambiente, num lugar só.
 *
 * Decisão de 11/09/2026: a MX usa Microsoft 365 e a caixa é
 * a caixa de sistemas da corretora. O envio sai pela API do Microsoft Graph, com
 * um registro de aplicativo (tenant, client id, segredo) — e NÃO por SMTP
 * com senha, porque a Microsoft está retirando a autenticação básica do
 * SMTP (funciona até dezembro de 2026 e depois morre). Construir em cima do
 * que morre em três meses seria fazer duas vezes.
 *
 * O Resend continua suportado: a decisão vive aqui, e trocar é trocar
 * variável, não código. O transporte SMTP saiu em 14/09 — era o caminho que
 * a Microsoft está retirando, trazia o nodemailer com vulnerabilidade alta,
 * e nunca foi ligado. Ordem: Graph, depois Resend. Nenhum completo →
 * `null`, e o sistema segue registrando "não enviado".
 *
 * Puro: recebe o ambiente como objeto, para o teste não depender de
 * `process.env`.
 */

export type ProvedorGraph = {
  tipo: "graph";
  tenant: string;
  clientId: string;
  segredo: string;
  /** A caixa que assina — extraída do remetente. */
  caixa: string;
  remetente: string;
  responderPara?: string;
};

export type ProvedorResend = {
  tipo: "resend";
  chave: string;
  remetente: string;
  responderPara?: string;
};

export type Provedor = ProvedorGraph | ProvedorResend;

type Ambiente = Record<string, string | undefined>;

const limpo = (v: string | undefined): string | undefined => {
  const t = v?.trim();
  return t ? t : undefined;
};

export function escolherProvedor(env: Ambiente): Provedor | null {
  const remetente = limpo(env.EMAIL_REMETENTE);
  const responderPara = limpo(env.EMAIL_RESPONDER_PARA);
  if (!remetente) return null;

  const tenant = limpo(env.MS_TENANT_ID);
  const clientId = limpo(env.MS_CLIENT_ID);
  const segredo = limpo(env.MS_CLIENT_SECRET);

  if (tenant && clientId && segredo) {
    const caixa = enderecoDoRemetente(remetente);
    // Sem um endereço de verdade no remetente não há caixa para assinar — e
    // é a caixa que o Graph usa na URL do envio.
    if (!caixa.includes("@")) return null;

    return { tipo: "graph", tenant, clientId, segredo, caixa, remetente, responderPara };
  }

  const chave = limpo(env.RESEND_API_KEY);
  if (chave) return { tipo: "resend", chave, remetente, responderPara };

  return null;
}

/**
 * O remetente precisa ser a própria caixa (ou um apelido dela): Google e
 * Microsoft reescrevem ou recusam "From" de endereço que a conta não pode
 * usar. Devolve o endereço dentro de `Nome <endereco>`, ou o valor inteiro.
 */
export function enderecoDoRemetente(remetente: string): string {
  const m = remetente.match(/<([^>]+)>\s*$/);
  return (m?.[1] ?? remetente).trim().toLowerCase();
}

/** `MX SaúdeVida <sistemas@exemplo.com.br>` → `MX SaúdeVida`; sem nome, vazio. */
export function nomeDoRemetente(remetente: string): string {
  const m = remetente.match(/^(.*?)\s*<[^>]+>\s*$/);
  return (m?.[1] ?? "").replace(/^"|"$/g, "").trim();
}

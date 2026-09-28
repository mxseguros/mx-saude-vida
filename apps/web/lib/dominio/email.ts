/**
 * O que vai por e-mail: destinatários, escape e a montagem da mensagem.
 *
 * Puro, sem I/O — o envio fica em `lib/email/enviar.ts`. Assim o texto é
 * testável sem chave, sem rede e sem banco.
 */

export type Destinatarios = { validos: string[]; invalidos: string[] };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Aceita vírgula, ponto-e-vírgula, espaço e quebra de linha como separador —
 * a analista cola de onde tiver. Duplicata some; inválido é devolvido para a
 * mensagem poder DIZER qual está errado, em vez de recusar tudo em bloco.
 */
export function separarDestinatarios(texto: string): Destinatarios {
  const partes = texto
    .split(/[,;\s]+/)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);

  const validos: string[] = [];
  const invalidos: string[] = [];

  for (const parte of partes) {
    if (EMAIL.test(parte)) {
      if (!validos.includes(parte)) validos.push(parte);
    } else if (!invalidos.includes(parte)) {
      invalidos.push(parte);
    }
  }

  return { validos, invalidos };
}

/**
 * Escape de HTML.
 *
 * O nome do cliente e a observação da analista entram no corpo do e-mail.
 * "Silva & Cia <matriz>" sem escape quebra a marcação; um `<script>` numa
 * observação viraria conteúdo ativo no cliente de e-mail de quem recebe.
 */
export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Substitui `{{chave}}` pelo valor.
 *
 * Variável desconhecida vira string vazia, nunca o literal `{{seguradora}}`:
 * um e-mail que chega ao cliente com chave de template no meio é pior do que
 * um e-mail com uma lacuna. Quem avisa o administrador de que a variável não existe é
 * `variaveisDesconhecidas`, na hora de salvar o modelo.
 */
export function renderizarTemplate(
  modelo: string,
  variaveis: Record<string, string>,
): string {
  return modelo.replace(/\{\{\s*([\w]+)\s*\}\}/g, (_, chave: string) =>
    variaveis[chave] ?? "",
  );
}

/** As chaves usadas no modelo que ninguém vai preencher. */
export function variaveisDesconhecidas(
  modelo: string,
  conhecidas: readonly string[],
): string[] {
  const usadas = [...modelo.matchAll(/\{\{\s*([\w]+)\s*\}\}/g)].map((m) => m[1] as string);
  return [...new Set(usadas.filter((u) => !conhecidas.includes(u)))];
}

/** `2026-09-10` -> `10/09/2026`. Data vazia vira travessão, nunca "Invalid Date". */
export function formatarData(iso: string | null): string {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  if (!ano || !mes || !dia) return iso;
  return `${dia}/${mes}/${ano}`;
}

export const CORRETORA = "MX Corretora de Seguros";

/**
 * O e-mail pronto, a partir do modelo e das variáveis.
 *
 * O corpo é texto simples com parágrafos: o administrador escreve numa caixa de
 * texto, não em HTML, e cada linha em branco vira parágrafo. Assim o mesmo
 * texto serve aos dois formatos sem ninguém escrever marcação.
 */
export function montarNotificacao(
  modelo: { assunto: string; corpo: string },
  variaveis: Record<string, string>,
): { assunto: string; texto: string; html: string } {
  const assunto = renderizarTemplate(modelo.assunto, variaveis).trim();
  const texto = renderizarTemplate(modelo.corpo, variaveis).trim();

  const paragrafos = texto
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 12px">${escaparHtml(p).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"></head>
<body style="margin:0;background:#FFFDFB;color:#1B2430;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.6">
<div style="max-width:560px;margin:0 auto;padding:24px">
  <p style="margin:0 0 16px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#6E7681">${escaparHtml(CORRETORA)}</p>
  ${paragrafos}
  <p style="margin:24px 0 0;padding-top:12px;border-top:1px solid #ECEBE7;font-size:12px;color:#98A0AA">
    Esta é uma mensagem automática sobre o seu seguro. Para falar com a gente,
    responda este e-mail.
  </p>
</div>
</body></html>`;

  return { assunto, texto, html };
}

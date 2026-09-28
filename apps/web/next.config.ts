import type { NextConfig } from "next";

/**
 * Cabeçalhos de segurança.
 *
 * O que cada um fecha:
 *   - X-Frame-Options DENY: ninguém embute o sistema num iframe de outro site
 *     (clickjacking sobre "Inativar cliente" ou "Enviar mensagem").
 *   - X-Content-Type-Options nosniff: o navegador não "adivinha" que um anexo
 *     servido como planilha é HTML executável.
 *   - Referrer-Policy: a URL com filtro não vaza para sites de terceiros.
 *   - Permissions-Policy: câmera, microfone, localização, pagamento e USB
 *     desligados. Recurso novo do navegador pede ajuste aqui e na CSP.
 *   - HSTS: a Vercel já manda no domínio dela; declarado aqui para valer no
 *     domínio da MX quando existir.
 *
 * A CSP entra em REPORT-ONLY primeiro. O Next injeta scripts inline na
 * hidratação e o tema é aplicado por um script inline no <head>, então a
 * política precisa de 'unsafe-inline' em script e style — e uma CSP que
 * bloqueia é a que só se descobre na tela em branco de uma analista.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const CABECALHOS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Content-Security-Policy-Report-Only", value: CSP },
];

const config: NextConfig = {
  reactStrictMode: true,
  // Nao anuncia o framework em header de resposta.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: CABECALHOS }];
  },
};

export default config;

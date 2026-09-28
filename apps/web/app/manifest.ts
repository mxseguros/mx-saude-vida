import type { MetadataRoute } from "next";

/**
 * Manifest para instalar no celular (17/09).
 *
 * Com ele o iPhone ("Adicionar à Tela de Início") e o Android ("Instalar
 * aplicativo") abrem o sistema em tela cheia, com o ícone da MX, sem a barra
 * do navegador. Sem service worker, de propósito: não há caso de uso
 * offline, e um cache mal feito mostraria um controle velho.
 *
 * Os ícones são os que já existem em `app/icon.png` e `app/apple-icon.png`
 * (gerados de `Docs/brand/gerar-favicon.py`); o Next os serve em `/icon.png`
 * e `/apple-icon.png`. A cor é `--mx-navy` do `globals.css`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MX SaúdeVida",
    short_name: "SaúdeVida",
    description: "Controle mensal de seguros saúde, vida e odonto da MX Corretora de Seguros.",
    start_url: "/controle",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FFFDFB",
    theme_color: "#071B34",
    lang: "pt-BR",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}

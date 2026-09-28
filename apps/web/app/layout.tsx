import type { Metadata, Viewport } from "next";
import { Manrope, Source_Sans_3 } from "next/font/google";
import "./globals.css";

/**
 * Tipografia da equipe, igual à do MX Sinistro: Manrope nos titulos, numeros
 * e botoes; Source Sans 3 no texto corrido, formularios e tabelas. O portal do
 * cliente tem tipografia propria, no layout do grupo dele.
 *
 * next/font hospeda as fontes junto do app: sem ida ao Google no runtime e
 * sem salto de layout.
 */

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
  variable: "--fonte-titulo",
});

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
  variable: "--fonte-texto",
});

export const metadata: Metadata = {
  title: {
    default: "MX SaúdeVida",
    template: "%s · MX SaúdeVida",
  },
  description:
    "Controle mensal de seguros saúde, vida e odonto da MX Corretora de Seguros.",
  // Sistema interno: nunca deve aparecer em busca.
  robots: { index: false, follow: false },
};

// A barra do sistema no celular instalado (17/09) fica na cor da marca.
export const viewport: Viewport = {
  themeColor: "#071B34",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function LayoutRaiz({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="pt-BR"
      // O script abaixo escreve data-theme antes da hidratacao.
      suppressHydrationWarning
      className={`${manrope.variable} ${sourceSans.variable}`}
    >
      <head>
        {/*
          Aplica o tema E o estado do menu ANTES do primeiro pixel.

          Sem isto a pagina pinta no tema do sistema e so troca quando o React
          hidrata — um flash branco na cara de quem escolheu escuro, que e
          justamente quem esta plantao a noite. O menu tem o mesmo problema em
          outra forma: a sidebar abriria com 232px e encolheria para 56px na
          hidratacao, empurrando a tela inteira de lado a cada carregamento.

          Roda antes de o React existir, entao nao pode ser um componente.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var d=document.documentElement,' +
              't=localStorage.getItem("mx-tema"),m=localStorage.getItem("mx-menu");' +
              'if(t==="escuro")d.setAttribute("data-theme","dark");' +
              'else if(t==="claro")d.setAttribute("data-theme","light");' +
              'if(m==="recolhido")d.setAttribute("data-menu","recolhido")}catch(e){}',
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

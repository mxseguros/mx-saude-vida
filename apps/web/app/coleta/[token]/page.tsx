import type { Metadata } from "next";
import { headers } from "next/headers";

import { urlBase } from "@/lib/ambiente";
import { lerColetaPorToken } from "@/lib/coleta/consulta";
import { marcarLinkAberto } from "@/lib/coleta/servico";
import { roboDePrevia } from "@/lib/dominio/coleta";

import { SemColeta } from "./sem-coleta";
import { Wizard } from "./wizard";

/**
 * O formulário que o gestor do cliente abre no celular, com o link do WhatsApp.
 *
 * Informa quem entrou e quem saiu no mês, e envia a planilha se tiver uma. Não
 * vê analista, observação interna, valor de boleto nem histórico — e a consulta
 * também não os busca, então não é só a tela que esconde.
 *
 * `robots: noindex` porque um link destes indexado é um convite para quem não
 * foi convidado. E `force-dynamic`: o estado do link muda quando alguém o usa,
 * e uma página em cache diria "aberto" depois de enviado.
 */

export const dynamic = "force-dynamic";

/**
 * O cartão que o WhatsApp mostra no topo da mensagem.
 *
 * O `wa.me` só transporta TEXTO: o cartão é o preview do link, que o WhatsApp
 * monta buscando esta página e lendo as meta tags.
 *
 * **Nada do cliente entra**, nem o nome da empresa: o preview fica na conversa,
 * é encaminhável, e aparece na tela de quem ainda não abriu nada. Por isso a
 * metadata é ESTÁTICA — não lê o token —, e é o que garante que um link
 * encaminhado não conte de quem ele é.
 */
export const metadata: Metadata = {
  title: "Movimentação do mês · MX Corretora de Seguros",
  description: "Informe quem entrou e quem saiu no mês. Leva menos de dois minutos.",
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    siteName: "MX Corretora de Seguros",
    title: "Movimentação do mês · MX Corretora de Seguros",
    description: "Informe quem entrou e quem saiu no mês. Leva menos de dois minutos.",
    locale: "pt_BR",
    // A imagem do cartão (07/10), gerada por `scripts/gerar-og.py`. URL
    // absoluta, com tipo e endereço seguro: o WhatsApp não resolve caminho
    // relativo, e alguns leitores descartam a imagem sem os dois. Sem `og:url`:
    // o robô buscaria a página sem o token.
    images: [
      {
        url: `${urlBase()}/og-coleta.png`,
        secureUrl: `${urlBase()}/og-coleta.png`,
        type: "image/png",
        width: 1200,
        height: 630,
        alt: "MX Corretora de Seguros",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Movimentação do mês · MX Corretora de Seguros",
    description: "Informe quem entrou e quem saiu no mês. Leva menos de dois minutos.",
    images: [`${urlBase()}/og-coleta.png`],
  },
};

export default async function PaginaDeColeta({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const coleta = await lerColetaPorToken(token);

  if (!coleta || coleta.estado === "invalido") return <SemColeta motivo="invalido" />;
  if (coleta.estado === "expirado") return <SemColeta motivo="expirado" />;

  // O carimbo de "abriu" não espera: `await` aqui atrasaria a primeira pintura
  // da página por um dado que é de conveniência. A função engole a própria
  // falha de propósito — ver o formulário importa mais que registrar a visita.
  // O WhatsApp abre o link sozinho para montar o cartão da mensagem: esse
  // acesso não é o gestor, e marcá-lo diria "abriu" antes de ele ver.
  if (!roboDePrevia((await headers()).get("user-agent"))) void marcarLinkAberto(token);

  // O wizard já traz o seu <main>: dois marcos de página confundem o leitor de
  // tela e fazem `locator("main")` achar dois na prova.
  return <Wizard token={token} coleta={coleta} />;
}

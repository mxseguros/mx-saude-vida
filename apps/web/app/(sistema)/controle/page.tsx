import type { Metadata } from "next";

import { TopoPagina } from "@/app/_admin/moldura";

export const metadata: Metadata = { title: "Controle mensal" };

/**
 * Controle mensal — a tela central do sistema.
 *
 * Sprint 0: só a moldura. A tabela do mês, os contadores de prazo e o envio de
 * mensagens entram na Sprint 2, quando `monthly_controls` existir.
 */
export default function PaginaControle() {
  return (
    <>
      <TopoPagina titulo="Controle mensal" />
      <div className="p-4 sm:p-6">
        <div className="mx-auto max-w-[720px] rounded-[10px] border border-line bg-surface p-5">
          <h2 className="font-(family-name:--font-display) text-[17px] font-[700] text-heading">
            O Controle chega na Sprint 2
          </h2>
          <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
            Aqui vai aparecer uma linha por cliente, com as quatro datas do mês (informar até, corte,
            boleto e vencimento), o passo em que cada um está e o botão para enviar a mensagem do
            passo atual. Antes disso, a Sprint 1 entrega o cadastro de clientes e a leitura da
            apólice.
          </p>
        </div>
      </div>
    </>
  );
}

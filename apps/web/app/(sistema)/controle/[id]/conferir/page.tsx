import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { TopoPagina } from "@/app/_admin/moldura";
import { lerControle, lerPlanilhaDoMes } from "@/lib/controles/consulta";
import { nomeCurto } from "@/lib/dominio/cliente";
import { rotuloDaCompetencia, ROTULO_PASSO, podeAgir } from "@/lib/dominio/controle";
import { formatarData } from "@/lib/dominio/email";

import { Conferencia } from "./conferencia";

export const metadata: Metadata = { title: "Conferir planilha" };

/**
 * Conferir a planilha do mês.
 *
 * A prévia das linhas NÃO vem daqui: ela é carregada pelo cliente, porque abrir
 * o xlsx leva tempo e a página precisa aparecer antes disso. O que o servidor
 * entrega é o contexto — qual cliente, qual mês, quais datas — e a decisão de
 * se a conferência ainda cabe.
 */
export default async function PaginaConferir({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [controle, ficha] = await Promise.all([lerControle(id), lerPlanilhaDoMes(id)]);

  if (controle.erro) {
    return (
      <>
        <TopoPagina titulo="Conferir planilha" voltar={{ href: "/controle", rotulo: "Voltar para o Controle" }} />
        <div className="p-4 sm:p-6">
          <p role="alert" className="rounded-[8px] border border-warn bg-warn-soft p-3 text-[13.5px] text-texto">
            {controle.erro} Tente de novo em alguns instantes.
          </p>
        </div>
      </>
    );
  }

  if (!controle.dados) notFound();

  const linha = controle.dados;
  const cliente = nomeCurto({ razaoSocial: linha.razaoSocial, nomeFantasia: linha.nomeFantasia });
  const cabe = podeAgir(linha.passo, "conferir") || podeAgir(linha.passo, "sem_movimentacao");

  return (
    <>
      <TopoPagina
        titulo={`Conferir ${rotuloDaCompetencia(linha.competencia).toLowerCase()}`}
        contagem={cliente}
        voltar={{ href: "/controle", rotulo: "Voltar para o Controle" }}
      />

      <div className="flex flex-col gap-4 p-4 sm:p-6">
        <p className="text-[13px] text-muted">
          {linha.seguradora ?? "sem seguradora"}
          {linha.datas.corte ? ` · corte ${formatarData(linha.datas.corte)}` : ""}
          {` · boleto ${formatarData(linha.datas.boleto)} · vence ${formatarData(linha.datas.vencimento)}`}
        </p>

        {/* Beco sem saída é defeito: se a conferência não cabe mais, a tela diz
            em que etapa o mês está e para onde ir. */}
        {!cabe ? (
          <div className="rounded-[10px] border border-line bg-surface p-6 text-center">
            <p className="font-(family-name:--font-display) text-[16px] font-[700] text-heading">
              Este mês já passou da conferência
            </p>
            <p className="mx-auto mt-1.5 max-w-[52ch] text-[13.5px] leading-relaxed text-muted">
              Ele está em <b className="text-heading">{ROTULO_PASSO[linha.passo].toLowerCase()}</b>. A planilha
              continua disponível abaixo, para consulta.
            </p>
            <div className="mt-4">
              <Link
                href="/controle"
                className="inline-flex min-h-[40px] items-center rounded-[6px] bg-brand px-4 font-(family-name:--font-display) text-[14px] font-[600] text-on-brand hover:bg-brand-hover"
              >
                Voltar para o Controle
              </Link>
            </div>
          </div>
        ) : null}

        <Conferencia
          controleId={id}
          cliente={cliente}
          competencia={linha.competencia}
          passo={linha.passo}
          semMudancas={linha.semMudancas}
          planilha={ficha.dados}
          podeDecidir={cabe}
        />
      </div>
    </>
  );
}

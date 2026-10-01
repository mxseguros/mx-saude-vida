import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { situacaoDoCliente } from "@/lib/supabase/servidor";
import { lerMesAtual } from "@/lib/portal/consulta";
import { pendenciaDoCliente, podeEnviarPlanilha } from "@/lib/dominio/portal";
import { hojeSaoPaulo } from "@/lib/dominio/hoje";
import { rotuloDaCompetencia } from "@/lib/dominio/controle";
import { formatarData } from "@/lib/dominio/email";
import { mascararDocumento } from "@/lib/dominio/mascaras";
import { nomeCurto } from "@/lib/dominio/cliente";

import { WizardDeEnvio } from "./wizard";

export const metadata: Metadata = { title: "Enviar planilha" };

/**
 * A tela de envio.
 *
 * O servidor decide se o envio CABE agora e só então monta o wizard. Mostrar o
 * formulário e recusar no fim seria fazer a pessoa preencher três etapas para
 * ouvir que o mês já andou — e a situação é comum: a aba fica aberta, a analista
 * pede correção, o gestor volta ao celular horas depois.
 */
export default async function PaginaDeEnvio() {
  const sessao = await situacaoDoCliente();
  if (sessao.estado !== "ok") redirect("/portal");

  const mes = await lerMesAtual();

  if (mes.erro) {
    return (
      <p role="alert" className="rounded-[10px] border border-warn bg-warn-soft p-4 text-[14px] text-texto">
        {mes.erro}
      </p>
    );
  }

  if (!mes.dados) {
    return <SemEnvio titulo="Não há mês aberto na sua conta" detalhe="Assim que a MX abrir a movimentação, o envio aparece aqui." />;
  }

  const linha = mes.dados;
  const hoje = hojeSaoPaulo();

  if (!podeEnviarPlanilha(linha.passo)) {
    const pendencia = pendenciaDoCliente(linha.passo, linha.datas, linha.competencia, hoje);
    return <SemEnvio titulo={pendencia.titulo} detalhe={pendencia.detalhe} />;
  }

  const empresa = nomeCurto({ razaoSocial: sessao.cliente.razaoSocial, nomeFantasia: sessao.cliente.nomeFantasia });

  return (
    <>
      <nav aria-label="Caminho" className="text-[12.5px] text-muted">
        <Link href="/portal" className="underline underline-offset-2 hover:text-heading">
          Meu painel
        </Link>
        <span aria-hidden="true"> › </span>
        <span>Enviar planilha</span>
      </nav>

      <header className="mt-2">
        <h1 className="font-(family-name:--font-display) text-[22px] font-[800] text-heading">
          Movimentação de {rotuloDaCompetencia(linha.competencia).toLowerCase()}
        </h1>
        <p className="mt-1 text-[13.5px] text-muted">
          {empresa}
          {linha.datas.informar ? ` · responda até ${formatarData(linha.datas.informar)}` : ""}
        </p>
      </header>

      <div className="mt-5">
        <WizardDeEnvio
          controleId={linha.id}
          competencia={linha.competencia}
          datas={linha.datas}
          empresa={empresa}
          documento={mascararDocumento(sessao.cliente.documento)}
          gestor={sessao.cliente.nome}
          celular={sessao.cliente.telefone}
        />
      </div>
    </>
  );
}

/**
 * O beco explicado.
 *
 * Em vez de esconder a tela, ela diz por que o envio não está disponível e para
 * onde ir. Beco sem saída é defeito: a pessoa chegou aqui por um link ou por um
 * botão que existia minutos atrás.
 */
function SemEnvio({ titulo, detalhe }: { titulo: string; detalhe: string }) {
  return (
    <div className="rounded-[10px] border border-line bg-surface p-6 text-center">
      <p className="font-(family-name:--font-display) text-[16px] font-[700] text-heading">{titulo}</p>
      <p className="mx-auto mt-1.5 max-w-[52ch] text-[13.5px] leading-relaxed text-muted">{detalhe}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        <Link
          href="/portal"
          className="inline-flex min-h-[40px] items-center rounded-[6px] bg-brand px-4 font-(family-name:--font-display) text-[14px] font-[600] text-on-brand hover:bg-brand-hover"
        >
          Voltar ao painel
        </Link>
        <Link
          href="/portal/documentos"
          className="inline-flex min-h-[40px] items-center rounded-[6px] border border-line-strong px-4 font-(family-name:--font-display) text-[14px] font-[600] text-heading hover:bg-surface-2"
        >
          Meus documentos
        </Link>
      </div>
    </div>
  );
}

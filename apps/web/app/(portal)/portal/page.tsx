import type { Metadata } from "next";
import Link from "next/link";

import { situacaoDoCliente } from "@/lib/supabase/servidor";
import { lerContrato, lerMesAtual } from "@/lib/portal/consulta";
import { hojeSaoPaulo } from "@/lib/dominio/hoje";
import { pendenciaDoCliente, podeEnviarPlanilha } from "@/lib/dominio/portal";
import { CHAVES_DE_DATA, ROTULO_DATA, aparenciaDaData, rotuloDaCompetencia } from "@/lib/dominio/controle";
import { formatarMoeda } from "@/lib/dominio/mascaras";
import { formatarData } from "@/lib/dominio/email";

export const metadata: Metadata = { title: "Meu painel" };

/**
 * O painel do cliente.
 *
 * Uma pergunta, respondida no alto da tela: **preciso fazer algo agora?** O
 * cartão da pendência vem antes de tudo, inclusive das datas — o gestor entra
 * uma vez por mês, e se a resposta estiver no meio da página ele vai ligar para
 * a analista em vez de rolar.
 *
 * Abaixo, as quatro datas e o contrato. São referência, não ação: ficam em dois
 * cartões lado a lado no desktop e empilhados no celular.
 */
export default async function PaginaDoPainel() {
  const sessao = await situacaoDoCliente();
  // O layout já garantiu o acesso; aqui é só para ter o nome em mãos.
  const nome = sessao.estado === "ok" ? sessao.cliente.nome.split(/\s+/)[0] : "";

  const [mes, contrato] = await Promise.all([lerMesAtual(), lerContrato()]);
  const hoje = hojeSaoPaulo();

  if (mes.erro) {
    return (
      <p role="alert" className="rounded-[10px] border border-warn bg-warn-soft p-4 text-[14px] text-texto">
        {mes.erro} Tente de novo em alguns instantes — o que você já enviou está guardado.
      </p>
    );
  }

  if (!mes.dados) {
    return (
      <>
        <h1 className="font-(family-name:--font-display) text-[22px] font-[800] text-heading">Olá, {nome}</h1>
        <div className="mt-5 rounded-[10px] border border-line bg-surface p-6">
          <p className="font-(family-name:--font-display) text-[15px] font-[700] text-heading">
            Ainda não há mês aberto na sua conta
          </p>
          <p className="mt-1.5 max-w-[56ch] text-[13.5px] leading-relaxed text-muted">
            Assim que a MX abrir a movimentação, ela aparece aqui e você recebe um aviso. Não precisa fazer nada
            agora.
          </p>
        </div>
      </>
    );
  }

  const linha = mes.dados;
  const pendencia = pendenciaDoCliente(linha.passo, linha.datas, linha.competencia, hoje);
  const podeEnviar = podeEnviarPlanilha(linha.passo);

  return (
    <>
      <header>
        <h1 className="font-(family-name:--font-display) text-[22px] font-[800] text-heading">Olá, {nome}</h1>
        <p className="mt-1 text-[13.5px] text-muted">
          {contrato.dados?.produto ?? "Seu seguro"}
          {contrato.dados?.seguradora ? ` · ${contrato.dados.seguradora}` : ""}
        </p>
      </header>

      {/* A pendência. Urgente ganha a borda vermelha; nunca o fundo vermelho —
          um bloco vermelho do tamanho deste cartão deixa de ser aviso e passa a
          ser susto. */}
      <section
        aria-labelledby="pendencia"
        className={
          "mt-5 flex flex-col gap-3 rounded-[12px] border-2 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5 " +
          (pendencia.urgente ? "border-bad bg-surface" : "border-brand bg-accent-soft")
        }
      >
        <div className="min-w-0 flex-1">
          <h2
            id="pendencia"
            className={
              "font-(family-name:--font-display) text-[16.5px] font-[800] " +
              (pendencia.urgente ? "text-bad" : "text-heading")
            }
          >
            {pendencia.titulo}
          </h2>
          <p className="mt-1 text-[13.5px] leading-relaxed text-texto">{pendencia.detalhe}</p>
          {pendencia.prazo ? (
            <p className="mt-1.5 text-[12.5px] text-muted">
              {pendencia.tipo === "pagar_boleto" ? "Vencimento" : "Prazo"}{" "}
              <b className="tabular font-[700] text-heading">{formatarData(pendencia.prazo)}</b>
              {linha.valorDoBoleto !== null && pendencia.tipo === "pagar_boleto"
                ? ` · ${formatarMoeda(linha.valorDoBoleto)}`
                : ""}
            </p>
          ) : null}
        </div>

        {pendencia.tipo === "enviar_planilha" && podeEnviar ? (
          <Link
            href="/portal/enviar"
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-[6px] bg-brand px-4 font-(family-name:--font-display) text-[14px] font-[600] text-on-brand hover:bg-brand-hover sm:min-h-[40px]"
          >
            Enviar planilha
          </Link>
        ) : pendencia.tipo === "pagar_boleto" ? (
          <Link
            href="/portal/documentos"
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-[6px] bg-brand px-4 font-(family-name:--font-display) text-[14px] font-[600] text-on-brand hover:bg-brand-hover sm:min-h-[40px]"
          >
            Ver o boleto
          </Link>
        ) : null}
      </section>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="datas" className="rounded-[10px] border border-line bg-surface p-4 sm:p-5">
          <h2 id="datas" className="font-(family-name:--font-display) text-[15px] font-[700] text-heading">
            Datas de {rotuloDaCompetencia(linha.competencia).toLowerCase()}
          </h2>
          <p className="mt-1 text-[12.5px] text-muted">Você recebe um aviso em cada uma delas.</p>

          <dl className="mt-3 flex flex-col">
            {CHAVES_DE_DATA.map((chave) => {
              const valor = linha.datas[chave];
              const aparencia = aparenciaDaData(chave, linha.passo, linha.datas, hoje);

              // A data em foco é a única com cor. Riscada é cumprida; cinza é
              // o que ainda vem.
              const cor =
                aparencia === "cumprida"
                  ? "text-faint line-through"
                  : aparencia === "vencido" || aparencia === "hoje"
                    ? "font-[700] text-bad"
                    : aparencia === "perto"
                      ? "font-[700] text-warn"
                      : aparencia === "no_prazo"
                        ? "font-[700] text-brand"
                        : "text-muted";

              return (
                <div
                  key={chave}
                  className="flex items-baseline justify-between gap-3 border-b border-line py-2 last:border-0"
                >
                  <dt className="text-[13px] text-muted">{ROTULO_DATA[chave]}</dt>
                  <dd className={`tabular text-[13.5px] ${cor}`}>{valor ? formatarData(valor) : "—"}</dd>
                </div>
              );
            })}
          </dl>
        </section>

        <section aria-labelledby="contrato" className="rounded-[10px] border border-line bg-surface p-4 sm:p-5">
          <h2 id="contrato" className="font-(family-name:--font-display) text-[15px] font-[700] text-heading">
            Contrato
          </h2>

          <dl className="mt-3 flex flex-col">
            <Linha rotulo="Situação" valor="Ativo" destaque />
            {contrato.dados ? (
              <>
                <Linha
                  rotulo="Apólice"
                  valor={
                    contrato.dados.seguradora
                      ? `${contrato.dados.seguradora} · ${contrato.dados.numero}`
                      : contrato.dados.numero
                  }
                />
                {contrato.dados.vigenciaDe || contrato.dados.vigenciaAte ? (
                  <Linha
                    rotulo="Vigência"
                    valor={`${formatarData(contrato.dados.vigenciaDe)} a ${formatarData(contrato.dados.vigenciaAte)}`}
                  />
                ) : null}
              </>
            ) : null}
            {linha.analista ? <Linha rotulo="Seu contato na MX" valor={linha.analista} /> : null}
          </dl>

          {!contrato.dados ? (
            <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
              Os dados da apólice aparecem aqui quando a MX terminar o cadastro dela.
            </p>
          ) : null}
        </section>
      </div>

      <Link
        href="/portal/documentos"
        className="mt-5 flex items-center gap-3.5 rounded-[10px] border border-line bg-surface p-4 hover:border-line-strong"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-(family-name:--font-display) text-[14.5px] font-[700] text-heading">
            Meus documentos
          </span>
          <span className="mt-0.5 block text-[12.5px] text-muted">
            Planilhas enviadas, boletos e a apólice, mês a mês
          </span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-[18px] text-muted">
          →
        </span>
      </Link>
    </>
  );
}

function Linha({ rotulo, valor, destaque = false }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-2 last:border-0">
      <dt className="shrink-0 text-[13px] text-muted">{rotulo}</dt>
      <dd className={`text-right text-[13.5px] ${destaque ? "font-[700] text-ok" : "text-heading"}`}>{valor}</dd>
    </div>
  );
}

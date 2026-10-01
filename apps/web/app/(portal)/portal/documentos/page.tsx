import type { Metadata } from "next";
import Link from "next/link";

import { listarMeusDocumentos, lerMesAtual, type DocumentoDoCliente } from "@/lib/portal/consulta";
import { podeEnviarPlanilha } from "@/lib/dominio/portal";
import { ROTULO_ARQUIVO, emMegabytes } from "@/lib/dominio/arquivo";
import { rotuloDaCompetencia, type Passo } from "@/lib/dominio/controle";

export const metadata: Metadata = { title: "Meus documentos" };

/**
 * O acervo do cliente.
 *
 * Agrupado por MÊS, e não por tipo: a pergunta real é "o que houve em setembro?",
 * nunca "quais são as minhas planilhas". A apólice não tem mês e vai para um
 * grupo próprio no fim, porque ela vale para o contrato inteiro.
 *
 * O download é um `<a>` comum apontando para a rota, que redireciona para a URL
 * assinada. Sem JavaScript no caminho: funciona no clique do meio, no "salvar
 * como" e no celular.
 */
export default async function PaginaDeDocumentos() {
  const [documentos, mes] = await Promise.all([listarMeusDocumentos(), lerMesAtual()]);
  const podeEnviar = mes.dados ? podeEnviarPlanilha(mes.dados.passo) : false;

  const grupos = agruparPorMes(documentos.dados);

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-(family-name:--font-display) text-[22px] font-[800] text-heading">Meus documentos</h1>
          <p className="mt-1 text-[13.5px] text-muted">
            Tudo o que você enviou e o que a MX disponibilizou, mês a mês.
          </p>
        </div>

        {podeEnviar ? (
          <Link
            href="/portal/enviar"
            className="inline-flex min-h-[44px] items-center justify-center rounded-[6px] bg-brand px-4 font-(family-name:--font-display) text-[14px] font-[600] text-on-brand hover:bg-brand-hover sm:min-h-[40px]"
          >
            Enviar planilha
          </Link>
        ) : null}
      </header>

      {documentos.erro ? (
        <p role="alert" className="mt-5 rounded-[10px] border border-warn bg-warn-soft p-4 text-[14px] text-texto">
          {documentos.erro}
        </p>
      ) : null}

      {!documentos.erro && grupos.length === 0 ? (
        <div className="mt-5 rounded-[10px] border border-line bg-surface p-6 text-center">
          <p className="font-(family-name:--font-display) text-[15px] font-[700] text-heading">
            Nenhum documento ainda
          </p>
          <p className="mx-auto mt-1.5 max-w-[52ch] text-[13.5px] leading-relaxed text-muted">
            O que você enviar pelo portal e o que a MX disponibilizar — boleto e apólice — aparece aqui, guardado por
            mês.
          </p>
        </div>
      ) : null}

      {grupos.map((grupo) => (
        <section key={grupo.chave} aria-labelledby={`grupo-${grupo.chave}`} className="mt-6">
          <h2
            id={`grupo-${grupo.chave}`}
            className="mb-2 font-(family-name:--font-display) text-[11px] font-[700] uppercase tracking-[.06em] text-faint"
          >
            {grupo.titulo}
          </h2>

          <ul className="flex list-none flex-col gap-2">
            {grupo.itens.map((documento) => (
              <li
                key={documento.id}
                className="flex flex-wrap items-center gap-3 rounded-[10px] border border-line bg-surface p-3.5"
              >
                <Selo tipo={documento.tipo} />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-[600] text-heading" title={documento.nome}>
                    {documento.nome}
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted">
                    {ROTULO_ARQUIVO[documento.tipo]}
                    {documento.protocolo && documento.tipo === "planilha" ? ` · ${documento.protocolo}` : ""}
                    {documento.tamanho ? ` · ${emMegabytes(documento.tamanho)}` : ""}
                    {` · enviado em ${quando(documento.criadoEm)}`}
                  </p>
                </div>

                {documento.tipo === "planilha" && documento.passo ? <Situacao passo={documento.passo} /> : null}

                <a
                  href={`/api/portal/arquivo/${documento.id}`}
                  className="inline-flex min-h-[36px] items-center rounded-[6px] border border-line-strong px-3 text-[12.5px] font-[600] text-heading hover:bg-surface-2"
                >
                  Baixar
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

/**
 * A situação da planilha, no vocabulário do cliente.
 *
 * "Conferida" é o que interessa a ele; o resto do caminho interno — corte,
 * boleto — não é estado da planilha e por isso aparece como conferida também.
 * Dizer "em corte" sobre um arquivo não significaria nada para quem lê.
 */
function Situacao({ passo }: { passo: Passo }) {
  const recebida = passo === "planilha_recebida";
  const rotulo = recebida ? "em conferência" : "conferida";

  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11.5px] font-[600] " +
        (recebida ? "bg-warn-soft text-warn" : "bg-ok-soft text-ok")
      }
    >
      {rotulo}
    </span>
  );
}

function Selo({ tipo }: { tipo: DocumentoDoCliente["tipo"] }) {
  const texto = tipo === "planilha" ? "XLS" : "PDF";
  return (
    <span
      aria-hidden="true"
      className={
        "flex h-9 w-11 shrink-0 items-center justify-center rounded-[6px] text-[10.5px] font-[700] " +
        (tipo === "planilha" ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad")
      }
    >
      {texto}
    </span>
  );
}

type Grupo = { chave: string; titulo: string; itens: DocumentoDoCliente[] };

/**
 * Agrupa por competência, do mês mais novo para o mais antigo.
 *
 * Feito aqui e não em SQL porque a apólice não tem competência: qualquer
 * `group by` no banco a deixaria de fora ou inventaria um mês para ela.
 */
function agruparPorMes(documentos: DocumentoDoCliente[]): Grupo[] {
  const porMes = new Map<string, DocumentoDoCliente[]>();
  const semMes: DocumentoDoCliente[] = [];

  for (const documento of documentos) {
    if (!documento.competencia) {
      semMes.push(documento);
      continue;
    }
    const atual = porMes.get(documento.competencia);
    if (atual) atual.push(documento);
    else porMes.set(documento.competencia, [documento]);
  }

  const grupos: Grupo[] = [...porMes.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([competencia, itens]) => ({
      chave: competencia,
      titulo: rotuloDaCompetencia(competencia),
      itens,
    }));

  // A apólice vale para o contrato inteiro, então fica no fim e não no topo:
  // quem abre esta tela está procurando o mês, não o documento permanente.
  if (semMes.length) grupos.push({ chave: "contrato", titulo: "Do contrato", itens: semMes });

  return grupos;
}

/** `2026-09-22T16:12:00Z` → `22/09 16:12`, no fuso de São Paulo. */
function quando(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

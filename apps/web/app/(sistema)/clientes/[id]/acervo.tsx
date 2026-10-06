"use client";

import { emMegabytes, ROTULO_ARQUIVO } from "@/lib/dominio/arquivo";
import { rotuloDaCompetencia } from "@/lib/dominio/controle";
import type { DocumentoDoAcervo } from "@/lib/clientes/consulta";

/** Os documentos do cliente (planilhas, apólice), na aba Movimentações. */
export function Documentos({ lista }: { lista: DocumentoDoAcervo[] }) {
  if (!lista.length) {
    return (
      <p className="text-[13.5px] leading-relaxed text-muted">
        Nenhum documento. Planilhas enviadas pelo portal, boletos e a apólice aparecem aqui.
      </p>
    );
  }

  return (
    <ul className="flex list-none flex-col gap-2">
      {lista.map((documento) => (
        <li
          key={documento.id}
          className="flex flex-wrap items-center gap-3 border-b border-line py-2.5 last:border-0"
        >
          <span
            aria-hidden="true"
            className={
              "flex h-8 w-10 shrink-0 items-center justify-center rounded-[5px] text-[10px] font-[700] " +
              (documento.tipo === "planilha" ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad")
            }
          >
            {documento.tipo === "planilha" ? "XLS" : "PDF"}
          </span>

          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-[600] text-heading" title={documento.nome}>
              {documento.nome}
            </span>
            <span className="block text-[12px] text-muted">
              {ROTULO_ARQUIVO[documento.tipo]}
              {documento.competencia ? ` · ${rotuloDaCompetencia(documento.competencia)}` : ""}
              {documento.protocolo && documento.tipo === "planilha" ? ` · ${documento.protocolo}` : ""}
              {documento.tamanho ? ` · ${emMegabytes(documento.tamanho)}` : ""}
            </span>
          </span>

          <a
            href={`/api/v1/arquivos/${documento.id}`}
            className="inline-flex min-h-[32px] items-center rounded-[6px] border border-line-strong px-2.5 text-[12px] font-[600] text-heading hover:bg-surface-2"
          >
            Baixar
          </a>
        </li>
      ))}
    </ul>
  );
}

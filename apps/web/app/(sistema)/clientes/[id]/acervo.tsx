"use client";

import { useState } from "react";

import { emMegabytes, ROTULO_ARQUIVO } from "@/lib/dominio/arquivo";
import { formatarMoeda } from "@/lib/dominio/mascaras";
import { formatarData } from "@/lib/dominio/email";
import { rotuloDaCompetencia } from "@/lib/dominio/controle";
import type { BoletoDoCliente, DocumentoDoAcervo } from "@/lib/clientes/consulta";

/**
 * Boletos e Documentos do cliente, em duas abas.
 *
 * Responde a pergunta que chega por telefone: "qual foi o valor de agosto?" e
 * "vocês receberam a minha planilha?". Hoje a analista abre o Excel e a caixa
 * de e-mail para responder isso.
 *
 * Duas abas e não duas seções porque a ficha do cliente já é longa — cadastro,
 * regras do mês, canal e acesso ao portal — e um acervo de 60 linhas empurraria
 * tudo para fora da tela.
 */

type Aba = "boletos" | "documentos";

export function Acervo({
  boletos,
  documentos,
}: {
  boletos: BoletoDoCliente[];
  documentos: DocumentoDoAcervo[];
}) {
  const [aba, setAba] = useState<Aba>(boletos.length ? "boletos" : "documentos");

  const abas: { id: Aba; rotulo: string; quantos: number }[] = [
    { id: "boletos", rotulo: "Boletos", quantos: boletos.length },
    { id: "documentos", rotulo: "Documentos", quantos: documentos.length },
  ];

  return (
    <section className="flex flex-col rounded-[10px] border border-line bg-surface">
      <div role="tablist" aria-label="Acervo do cliente" className="flex gap-1 border-b border-line px-4 sm:px-5">
        {abas.map((item) => {
          const ativa = item.id === aba;
          return (
            <button
              key={item.id}
              role="tab"
              type="button"
              aria-selected={ativa}
              onClick={() => setAba(item.id)}
              className={
                "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13.5px] font-[600] " +
                (ativa ? "border-brand text-heading" : "border-transparent text-muted hover:text-heading")
              }
            >
              {item.rotulo}
              <span className={`tabular text-[11.5px] ${item.quantos ? "text-muted" : "text-faint"}`}>
                {item.quantos}
              </span>
            </button>
          );
        })}
      </div>

      <div className="p-4 sm:p-5">
        {aba === "boletos" ? <Boletos lista={boletos} /> : <Documentos lista={documentos} />}
      </div>
    </section>
  );
}

function Boletos({ lista }: { lista: BoletoDoCliente[] }) {
  if (!lista.length) {
    return (
      <p className="text-[13.5px] leading-relaxed text-muted">
        Nenhum boleto anexado ainda. Eles aparecem aqui conforme a analista anexa no Controle.
      </p>
    );
  }

  return (
    <ul className="flex list-none flex-col gap-2">
      {lista.map((boleto) => (
        <li
          key={boleto.controleId}
          className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-line py-2.5 last:border-0"
        >
          <span className="min-w-[120px] font-(family-name:--font-display) text-[13.5px] font-[700] text-heading">
            {rotuloDaCompetencia(boleto.competencia)}
          </span>

          <span className="tabular text-[13.5px] text-heading">
            {boleto.valor === null ? "valor não informado" : formatarMoeda(boleto.valor)}
          </span>

          {boleto.parcela ? (
            <span className="text-[12.5px] text-muted">parcela {boleto.parcela}</span>
          ) : null}

          <span className="tabular text-[12.5px] text-muted">
            {boleto.vencimento ? `vence ${formatarData(boleto.vencimento)}` : ""}
          </span>

          <span className="flex-1" />

          {/* Pago é o estado que a analista procura ao atender o telefone. */}
          {boleto.pagaEm ? (
            <span className="inline-flex items-center rounded-full bg-ok-soft px-2 py-0.5 text-[11.5px] font-[600] text-ok">
              pago
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-surface-3 px-2 py-0.5 text-[11.5px] font-[600] text-muted">
              em aberto
            </span>
          )}

          {boleto.arquivoId ? (
            <a
              href={`/api/v1/arquivos/${boleto.arquivoId}`}
              className="inline-flex min-h-[32px] items-center rounded-[6px] border border-line-strong px-2.5 text-[12px] font-[600] text-heading hover:bg-surface-2"
            >
              Baixar
            </a>
          ) : (
            <span className="text-[12px] text-faint">sem PDF</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function Documentos({ lista }: { lista: DocumentoDoAcervo[] }) {
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

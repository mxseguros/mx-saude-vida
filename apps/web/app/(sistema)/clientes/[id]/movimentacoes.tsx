import Link from "next/link";

import type { MovimentacaoDoMes, OrigemDaMovimentacao } from "@/lib/clientes/consulta";
import { rotuloDaCompetencia, ROTULO_PASSO } from "@/lib/dominio/controle";
import { formatarData } from "@/lib/dominio/email";
import { formatarMoeda } from "@/lib/dominio/mascaras";

const ORIGEM: Record<OrigemDaMovimentacao, string> = {
  link: "formulário (link)",
  equipe: "digitado pela MX",
  sem_movimentacao: "sem movimentação",
  planilha: "planilha",
  aguardando: "aguardando o gestor",
};

const corDoPasso = (passo: MovimentacaoDoMes["passo"]) =>
  passo === "concluida"
    ? "bg-ok-soft text-ok"
    : passo === "informar" || passo === "planilha_recebida"
      ? "bg-warn-soft text-warn"
      : "bg-surface-2 text-brand";

/**
 * Aba Movimentações (v0.7): um mês por linha. Vidas e Prêmio só no mês atual —
 * o sistema não guarda a foto de meses passados (decisão 2A de 07/10).
 */
export function Movimentacoes({
  lista,
  atual,
}: {
  lista: MovimentacaoDoMes[];
  atual: { competencia: string; vidas: number; premio: number | null };
}) {
  if (!lista.length) {
    return (
      <p className="rounded-[10px] border border-line bg-surface p-4 text-[13.5px] text-muted">
        Nenhum mês aberto para este cliente ainda.
      </p>
    );
  }

  const vidas = (m: MovimentacaoDoMes) => (m.competencia === atual.competencia ? String(atual.vidas) : "—");
  const premio = (m: MovimentacaoDoMes) =>
    m.competencia === atual.competencia && atual.premio !== null ? formatarMoeda(atual.premio) : "—";
  const conferida = (m: MovimentacaoDoMes) =>
    m.conferidaPor ? `${m.conferidaPor}${m.conferidaEm ? ` · ${formatarData(m.conferidaEm.slice(0, 10))}` : ""}` : "—";
  const etapa = (m: MovimentacaoDoMes) => (
    <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-[600] ${corDoPasso(m.passo)}`}>
      {ROTULO_PASSO[m.passo]}
    </span>
  );
  const numero = ["Entradas", "Saídas", "Vidas", "Prêmio"];

  return (
    <>
      <div className="hidden overflow-hidden rounded-[10px] border border-line bg-surface md:block">
        <table className="w-full table-fixed border-collapse text-[13px]">
          <colgroup>
            <col className="w-[14%]" />
            <col className="w-[16%]" />
            <col className="w-[16%]" />
            <col className="w-[8%]" />
            <col className="w-[8%]" />
            <col className="w-[7%]" />
            <col className="w-[11%]" />
            <col className="w-[20%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-line text-left">
              {["Competência", "Origem", "Etapa", ...numero, "Conferida por"].map((t) => (
                <th
                  key={t}
                  className={`px-2.5 py-2.5 font-(family-name:--font-display) text-[11px] font-[700] uppercase tracking-[.06em] text-muted ${numero.includes(t) ? "text-right" : ""}`}
                >
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lista.map((m) => (
              <tr key={m.controleId} className="border-b border-line align-top last:border-0 hover:bg-surface-2">
                <td className="px-2.5 py-2.5">
                  <Link
                    href={`/controle/${m.controleId}/conferir`}
                    className="font-[600] text-heading underline-offset-2 hover:underline"
                  >
                    {rotuloDaCompetencia(m.competencia)}
                  </Link>
                </td>
                <td className="break-words px-2.5 py-2.5">{ORIGEM[m.origem]}</td>
                <td className="px-2.5 py-2.5">{etapa(m)}</td>
                <td className="tabular px-2.5 py-2.5 text-right">{m.entradas}</td>
                <td className="tabular px-2.5 py-2.5 text-right">{m.saidas}</td>
                <td className="tabular px-2.5 py-2.5 text-right">{vidas(m)}</td>
                <td className="tabular px-2.5 py-2.5 text-right">{premio(m)}</td>
                <td className="break-words px-2.5 py-2.5 text-muted">{conferida(m)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="m-0 flex list-none flex-col gap-2 p-0 md:hidden">
        {lista.map((m) => (
          <li key={m.controleId}>
            <Link
              href={`/controle/${m.controleId}/conferir`}
              className="flex flex-col gap-1 rounded-[10px] border border-line bg-surface p-3.5"
            >
              <span className="flex items-center justify-between gap-2">
                <b className="font-[700] text-heading">{rotuloDaCompetencia(m.competencia)}</b>
                {etapa(m)}
              </span>
              <span className="text-[12.5px] text-texto">
                {ORIGEM[m.origem]} · {m.entradas} entrada(s) · {m.saidas} saída(s)
              </span>
              <span className="text-[12.5px] text-muted">Conferida por {conferida(m)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

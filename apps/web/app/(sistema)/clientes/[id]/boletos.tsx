import { LinkBotao } from "@/componentes/ui/botao";
import type { BoletoDoCliente } from "@/lib/clientes/consulta";
import { rotuloDaCompetencia } from "@/lib/dominio/controle";
import { formatarData } from "@/lib/dominio/email";
import { formatarMoeda } from "@/lib/dominio/mascaras";

/**
 * Aba Boletos (v0.7). Reenviar leva ao Controle do mês, onde está a mensagem
 * de boleto com o PDF anexado: um lugar só para enviar.
 */
export function Boletos({ lista }: { lista: BoletoDoCliente[] }) {
  if (!lista.length) {
    return (
      <p className="rounded-[10px] border border-line bg-surface p-4 text-[13.5px] text-muted">
        Nenhum boleto anexado para este cliente ainda.
      </p>
    );
  }

  const enviado = (b: BoletoDoCliente) =>
    b.enviadoEm ? `${formatarData(b.enviadoEm.slice(0, 10))}${b.enviadoPor ? ` · ${b.enviadoPor}` : ""}` : "não enviado";
  const situacao = (b: BoletoDoCliente) =>
    b.pagaEm ? (
      <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[11.5px] font-[600] text-ok">pago</span>
    ) : (
      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11.5px] font-[600] text-brand">
        {b.enviadoEm ? "enviado" : "anexado"}
      </span>
    );
  const acoes = (b: BoletoDoCliente) => (
    <div className="flex flex-wrap gap-1.5">
      {b.arquivoId ? (
        <LinkBotao href={`/api/v1/arquivos/${b.arquivoId}`} variante="secundario">
          Baixar PDF
        </LinkBotao>
      ) : null}
      <LinkBotao href={`/controle?mes=${b.competencia}`} variante="texto">
        Reenviar
      </LinkBotao>
    </div>
  );
  const vence = (b: BoletoDoCliente) => (b.vencimento ? formatarData(b.vencimento) : "—");
  const valor = (b: BoletoDoCliente) => (b.valor === null ? "—" : formatarMoeda(b.valor));

  return (
    <>
      <div className="hidden overflow-hidden rounded-[10px] border border-line bg-surface md:block">
        <table className="w-full table-fixed border-collapse text-[13px]">
          <colgroup>
            <col className="w-[12%]" />
            <col className="w-[8%]" />
            <col className="w-[14%]" />
            <col className="w-[12%]" />
            <col className="w-[11%]" />
            <col className="w-[15%]" />
            <col className="w-[9%]" />
            <col className="w-[19%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-line text-left">
              {["Competência", "Parcela", "Nosso número", "Valor", "Vencimento", "Enviado ao cliente", "Situação", ""].map(
                (t, i) => (
                  <th
                    key={t || i}
                    className={`px-2.5 py-2.5 font-(family-name:--font-display) text-[11px] font-[700] uppercase tracking-[.06em] text-muted ${t === "Valor" ? "text-right" : ""}`}
                  >
                    {t}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {lista.map((b) => (
              <tr key={b.controleId} className="border-b border-line align-top last:border-0">
                <td className="px-2.5 py-2.5 font-[600] text-heading">{rotuloDaCompetencia(b.competencia)}</td>
                <td className="tabular px-2.5 py-2.5">{b.parcela ?? "—"}</td>
                <td className="tabular break-words px-2.5 py-2.5">{b.numero ?? "—"}</td>
                <td className="tabular px-2.5 py-2.5 text-right">{valor(b)}</td>
                <td className="tabular px-2.5 py-2.5">{vence(b)}</td>
                <td className="break-words px-2.5 py-2.5 text-muted">{enviado(b)}</td>
                <td className="px-2.5 py-2.5">{situacao(b)}</td>
                <td className="px-2.5 py-1.5">{acoes(b)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="m-0 flex list-none flex-col gap-2 p-0 md:hidden">
        {lista.map((b) => (
          <li key={b.controleId} className="flex flex-col gap-1 rounded-[10px] border border-line bg-surface p-3.5">
            <span className="flex items-center justify-between gap-2">
              <b className="font-[700] text-heading">{rotuloDaCompetencia(b.competencia)}</b>
              {situacao(b)}
            </span>
            <span className="text-[12.5px] text-texto">
              {valor(b)} · vence {vence(b)}
              {b.parcela ? ` · parcela ${b.parcela}` : ""}
            </span>
            <span className="text-[12.5px] text-muted">Enviado: {enviado(b)}</span>
            {acoes(b)}
          </li>
        ))}
      </ul>
    </>
  );
}

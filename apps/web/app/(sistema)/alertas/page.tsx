import type { Metadata } from "next";

import { TopoPagina } from "@/app/_admin/moldura";
import { ConfirmarEmissao } from "@/componentes/confirmar-emissao";
import { LinkBotao } from "@/componentes/ui/botao";
import { lerAlertas } from "@/lib/alertas/consulta";
import { ROTULO_GRUPO, type GrupoDeAlerta } from "@/lib/dominio/alerta";
import { hojeSaoPaulo } from "@/lib/dominio/hoje";

export const metadata: Metadata = { title: "Alertas de prazo" };

const MARCA: Record<GrupoDeAlerta, string> = { atrasado: "!", hoje: "●", perto: "◔", validar: "✎" };

export default async function PaginaAlertas() {
  const hoje = hojeSaoPaulo();
  const alertas = await lerAlertas(hoje);
  const grupos: GrupoDeAlerta[] = ["atrasado", "hoje", "perto", "validar"];

  return (
    <>
      <TopoPagina titulo="Alertas de prazo" contagem={alertas.erro ? undefined : String(alertas.dados.length)} />
      <div className="mx-auto flex w-full max-w-[860px] flex-col gap-5 p-4 sm:p-6">
        <p className="m-0 text-[13px] text-muted">
          Gerados das Regras do mês de cada cliente: o dia de compartilhar o link, o corte, o boleto e o vencimento.
          Somem quando a ação é registrada.
        </p>

        {alertas.erro ? (
          <p role="alert" className="rounded-[8px] border border-warn bg-warn-soft p-3 text-[13.5px] text-texto">
            {alertas.erro} Tente de novo em alguns instantes.
          </p>
        ) : alertas.dados.length === 0 ? (
          <p className="rounded-[10px] border border-ok bg-ok-soft p-4 text-[13.5px] text-texto">
            Nenhum prazo atrasado, para hoje ou nos próximos 3 dias.
          </p>
        ) : (
          grupos.map((grupo) => {
            const lista = alertas.dados.filter((a) => a.grupo === grupo);
            if (!lista.length) return null;
            const urgente = grupo === "atrasado" || grupo === "hoje";
            return (
              <section key={grupo} aria-labelledby={`grupo-${grupo}`} className="flex flex-col gap-2">
                <h2
                  id={`grupo-${grupo}`}
                  className={`m-0 text-[11.5px] font-[700] uppercase tracking-[.08em] ${grupo === "atrasado" ? "text-bad" : "text-muted"}`}
                >
                  {grupo === "hoje" ? `Hoje, ${hoje.slice(8, 10)}/${hoje.slice(5, 7)}` : ROTULO_GRUPO[grupo]} · {lista.length}
                </h2>
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {lista.map((a) => (
                    <li
                      key={`${a.controleId}-${a.titulo}`}
                      className="flex flex-wrap items-center gap-3 rounded-[10px] border border-line bg-surface px-3.5 py-3"
                    >
                      <span
                        aria-hidden="true"
                        className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-[700] ${
                          grupo === "atrasado" ? "bg-bad-soft text-bad" : grupo === "perto" ? "bg-warn-soft text-warn" : "bg-surface-2 text-brand"
                        }`}
                      >
                        {MARCA[grupo]}
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <b className={`break-words text-[13.5px] font-[600] ${grupo === "atrasado" ? "text-bad" : "text-heading"}`}>
                          {a.titulo}
                        </b>
                        <span className="text-[12.5px] text-muted">{a.detalhe}</span>
                      </div>
                      {a.acao.confirmar ? (
                        <ConfirmarEmissao controleId={a.acao.confirmar} variante={urgente ? "primario" : "secundario"} />
                      ) : (
                        <LinkBotao href={a.acao.href} variante={urgente ? "primario" : "secundario"}>
                          {a.acao.rotulo}
                        </LinkBotao>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </div>
    </>
  );
}

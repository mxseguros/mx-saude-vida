import Link from "next/link";

import {
  ACAO_DA_ATIVIDADE,
  CURTO_ATIVIDADE,
  ROTULO_ATIVIDADE,
  TIPOS_DE_ATIVIDADE,
  colunaDoPrimeiroDia,
  diasDaCompetencia,
  fimDeSemana,
  nomeDoDiaDaSemana,
  pendenciasDeAgora,
  porDia,
  semanaDe,
  type Atividade,
  type TipoDeAtividade,
} from "@/lib/dominio/atividade";

/**
 * As vistas Mês e Semana do Controle.
 *
 * A Lista responde "como está cada cliente". A agenda responde outra pergunta:
 * **o que eu tenho para fazer no dia 10?** Mesmos dados virados de lado.
 *
 * Servidor, sem estado de cliente: o dia escolhido vive na URL (`?dia=`), então
 * a analista manda o link do dia 10 para a colega e ela abre no mesmo lugar.
 */

/** A cor de cada tipo. Sóbria de propósito: quatro cores fortes viram ruído. */
const COR: Record<TipoDeAtividade, { fundo: string; texto: string; marca: string }> = {
  informar: { fundo: "bg-accent-soft", texto: "text-on-accent-soft", marca: "bg-brand" },
  corte: { fundo: "bg-surface-3", texto: "text-muted", marca: "bg-[var(--mx-navy)]" },
  boleto: { fundo: "bg-ok-soft", texto: "text-ok", marca: "bg-ok" },
  vencimento: { fundo: "bg-warn-soft", texto: "text-warn", marca: "bg-warn" },
};

function Etiqueta({ tipo }: { tipo: TipoDeAtividade }) {
  const cor = COR[tipo];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-[4px] px-1.5 py-0.5 text-[10.5px] font-[700] ${cor.fundo} ${cor.texto}`}
    >
      {ROTULO_ATIVIDADE[tipo]}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Mês                                                                        */
/* -------------------------------------------------------------------------- */

export function VistaMes({
  competencia,
  atividades,
  hoje,
  diaEscolhido,
}: {
  competencia: string;
  atividades: Atividade[];
  hoje: string;
  diaEscolhido: string | null;
}) {
  const dias = diasDaCompetencia(competencia);
  const agrupado = porDia(atividades);
  const vazias = colunaDoPrimeiroDia(competencia);

  const doPainel = diaEscolhido
    ? atividades.filter((a) => a.dia === diaEscolhido)
    : pendenciasDeAgora(atividades, hoje);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex flex-col gap-2.5">
        <div className="grid grid-cols-7 gap-[3px] sm:gap-1.5">
          {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((nome) => (
            <span
              key={nome}
              className="pb-1 text-center font-(family-name:--font-display) text-[10.5px] font-[700] uppercase tracking-[.06em] text-faint"
            >
              {nome}
            </span>
          ))}

          {/* As células antes do dia 1. Sem elas o mês desenha deslocado — e
              deslocado é pior que ausente, porque parece certo. */}
          {Array.from({ length: vazias }, (_, i) => (
            <span key={`vazia-${i}`} aria-hidden="true" className="min-h-[64px] rounded-[8px] bg-surface-2/40" />
          ))}

          {dias.map((dia) => {
            const resumo = agrupado.get(dia);
            const ehHoje = dia === hoje;
            const escolhido = dia === diaEscolhido;
            const pendentes = Object.entries(resumo?.pendentes ?? {}) as [TipoDeAtividade, number][];

            return (
              <Link
                key={dia}
                href={`/controle?mes=${competencia}&vista=mes&dia=${dia}`}
                scroll={false}
                aria-current={escolhido ? "true" : undefined}
                className={[
                  "flex min-h-[64px] flex-col gap-1 rounded-[8px] border p-1.5 sm:min-h-[84px] sm:p-2",
                  escolhido ? "border-brand bg-accent-soft" : "border-line bg-surface hover:border-line-strong",
                  fimDeSemana(dia) && !escolhido ? "bg-surface-2/60" : "",
                  // Dia com atrasada ganha a BORDA vermelha, nunca o fundo: uma
                  // grade com dez dias de fundo vermelho não se lê.
                  resumo?.temAtrasada ? "border-bad" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span
                  className={
                    "tabular text-[11.5px] font-[700] " +
                    (ehHoje ? "text-brand" : resumo?.temAtrasada ? "text-bad" : "text-muted")
                  }
                >
                  {Number(dia.slice(8, 10))}
                  {ehHoje ? <span className="ml-1 font-[600] text-[10px]">hoje</span> : null}
                </span>

                {pendentes.map(([tipo, quantas]) => (
                  <span
                    key={tipo}
                    className={`truncate rounded-[3px] px-1 text-[10px] font-[600] ${COR[tipo].fundo} ${COR[tipo].texto}`}
                  >
                    {CURTO_ATIVIDADE[tipo]} {quantas}
                  </span>
                ))}

                {/* Dia resolvido não leva contador por tipo: enchê-lo de
                    números faria conferir dez vezes o que estava pronto. */}
                {resumo?.feitas && !pendentes.length ? (
                  <span className="truncate text-[10px] font-[600] text-ok">✓ {resumo.feitas} feitas</span>
                ) : null}
              </Link>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-[8px] border border-line px-3 py-2 text-[11.5px] text-muted">
          {TIPOS_DE_ATIVIDADE.map((tipo) => (
            <span key={tipo} className="flex items-center gap-1.5">
              <i aria-hidden="true" className={`h-2.5 w-2.5 rounded-[2px] ${COR[tipo].marca}`} />
              {ROTULO_ATIVIDADE[tipo]}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <i aria-hidden="true" className="h-2.5 w-2.5 rounded-[2px] border-2 border-bad" />
            dia com atrasada
          </span>
          <span className="text-faint">· os contadores mostram só o que falta</span>
        </div>
      </div>

      <Painel
        competencia={competencia}
        atividades={doPainel}
        titulo={
          diaEscolhido
            ? `${nomeDoDiaDaSemana(diaEscolhido)}, ${diaEscolhido.slice(8, 10)}/${diaEscolhido.slice(5, 7)}`
            : "Atrasadas e de hoje"
        }
        mostrandoDia={Boolean(diaEscolhido)}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Semana                                                                     */
/* -------------------------------------------------------------------------- */

export function VistaSemana({
  competencia,
  atividades,
  hoje,
  diaEscolhido,
}: {
  competencia: string;
  atividades: Atividade[];
  hoje: string;
  diaEscolhido: string | null;
}) {
  // A semana que contém o dia escolhido, ou a de hoje. Quando a competência não
  // é a corrente, a do dia 1 — senão a tela abriria numa semana sem nada.
  const referencia =
    diaEscolhido ?? (hoje.startsWith(competencia) ? hoje : `${competencia}-01`);
  const dias = semanaDe(referencia);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-7">
        {dias.map((dia) => {
          const doDia = atividades.filter((a) => a.dia === dia);
          const aFazer = doDia.filter((a) => a.estado !== "feita").length;
          const ehHoje = dia === hoje;
          const deOutroMes = !dia.startsWith(competencia);

          return (
            <div
              key={dia}
              className={[
                "flex min-h-[120px] flex-col gap-1.5 rounded-[8px] border p-2",
                ehHoje ? "border-brand bg-accent-soft" : "border-line bg-surface",
                fimDeSemana(dia) && !ehHoje ? "bg-surface-2/60" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div className="flex items-baseline justify-between gap-1 border-b border-line pb-1">
                <b
                  className={
                    "font-(family-name:--font-display) text-[12px] font-[700] " +
                    (ehHoje ? "text-brand" : deOutroMes ? "text-faint" : "text-heading")
                  }
                >
                  {nomeDoDiaDaSemana(dia).slice(0, 3)} {Number(dia.slice(8, 10))}
                </b>
                <span className={`tabular text-[10.5px] ${aFazer ? "text-muted" : "text-faint"}`}>
                  {aFazer ? `${aFazer} a fazer` : "—"}
                </span>
              </div>

              {doDia.length ? (
                doDia.map((atividade) => (
                  <Cartao key={`${atividade.controleId}-${atividade.tipo}`} atividade={atividade} />
                ))
              ) : (
                <span className="text-[11px] text-faint">—</span>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[12px] leading-relaxed text-muted">
        Semana de {dias[0]?.slice(8, 10)}/{dias[0]?.slice(5, 7)} a {dias[6]?.slice(8, 10)}/
        {dias[6]?.slice(5, 7)}. Cartão riscado está feito; borda vermelha está atrasado. Para ver outra semana,
        clique num dia na vista Mês.
      </p>
    </div>
  );
}

function Cartao({ atividade }: { atividade: Atividade }) {
  const feita = atividade.estado === "feita";
  const atrasada = atividade.estado === "atrasada";

  return (
    <Link
      href={`/controle/${atividade.controleId}/conferir`}
      className={[
        "flex flex-col gap-0.5 rounded-[6px] border p-1.5 hover:border-line-strong",
        atrasada ? "border-bad" : "border-line",
        feita ? "opacity-60" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Etiqueta tipo={atividade.tipo} />
      <b
        className={
          "truncate text-[11.5px] font-[600] " + (feita ? "text-muted line-through" : "text-heading")
        }
        title={atividade.cliente}
      >
        {atividade.cliente}
      </b>
      <span className="truncate text-[10.5px] text-muted">
        {atividade.seguradora ?? "sem seguradora"}
        {atividade.analista ? ` · ${atividade.analista}` : ""}
      </span>
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* O painel lateral do mês                                                    */
/* -------------------------------------------------------------------------- */

function Painel({
  competencia,
  atividades,
  titulo,
  mostrandoDia,
}: {
  competencia: string;
  atividades: Atividade[];
  titulo: string;
  mostrandoDia: boolean;
}) {
  const atrasadas = atividades.filter((a) => a.estado === "atrasada");
  const pendentes = atividades.filter((a) => a.estado === "pendente");
  const feitas = atividades.filter((a) => a.estado === "feita");

  return (
    <aside className="flex flex-col gap-3 rounded-[10px] border border-line bg-surface p-3.5 lg:sticky lg:top-4">
      <h3 className="font-(family-name:--font-display) text-[14.5px] font-[700] text-heading">{titulo}</h3>

      {!atividades.length ? (
        <p className="text-[13px] leading-relaxed text-muted">
          {mostrandoDia ? "Nada neste dia." : "Nada atrasado e nada para hoje."}
        </p>
      ) : null}

      <Grupo titulo="Atrasadas" lista={atrasadas} alerta />
      <Grupo titulo={mostrandoDia ? "A fazer" : "Hoje"} lista={pendentes} />
      <Grupo titulo="Feitas" lista={feitas} />

      {mostrandoDia ? (
        <Link
          href={`/controle?mes=${competencia}&vista=mes`}
          scroll={false}
          className="text-[12.5px] text-muted underline underline-offset-2 hover:text-heading"
        >
          ← voltar para atrasadas e hoje
        </Link>
      ) : null}
    </aside>
  );
}

function Grupo({ titulo, lista, alerta = false }: { titulo: string; lista: Atividade[]; alerta?: boolean }) {
  if (!lista.length) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <span
        className={
          "flex items-center gap-1.5 font-(family-name:--font-display) text-[10.5px] font-[700] uppercase tracking-[.06em] " +
          (alerta ? "text-bad" : "text-faint")
        }
      >
        {titulo}
        <i className="tabular font-[700] not-italic">{lista.length}</i>
      </span>

      <ul className="flex list-none flex-col gap-1.5">
        {lista.map((atividade) => (
          <li
            key={`${atividade.controleId}-${atividade.tipo}`}
            className={
              "flex flex-col gap-1 rounded-[8px] border p-2 " +
              (atividade.estado === "atrasada" ? "border-bad" : "border-line")
            }
          >
            <span className="flex flex-wrap items-center gap-1.5">
              <Etiqueta tipo={atividade.tipo} />
              {atividade.estado === "atrasada" ? (
                <span className="tabular text-[10.5px] font-[600] text-bad">
                  atrasada desde {atividade.dia.slice(8, 10)}/{atividade.dia.slice(5, 7)}
                </span>
              ) : atividade.estado === "feita" ? (
                <span className="text-[10.5px] font-[600] text-ok">feita</span>
              ) : null}
            </span>

            <b
              className={
                "text-[13px] font-[600] " +
                (atividade.estado === "feita" ? "text-muted line-through" : "text-heading")
              }
            >
              {atividade.cliente}
            </b>

            <span className="text-[11.5px] text-muted">
              {atividade.seguradora ?? "sem seguradora"}
              {atividade.analista ? ` · ${atividade.analista}` : ""}
            </span>

            {atividade.estado !== "feita" ? (
              <Link
                href={
                  atividade.tipo === "boleto" || atividade.passo === "planilha_recebida"
                    ? `/controle/${atividade.controleId}/conferir`
                    : `/controle?mes=${atividade.dia.slice(0, 7)}&vista=lista`
                }
                className="mt-0.5 w-fit text-[12px] font-[600] text-heading underline underline-offset-2 hover:text-brand"
              >
                {ACAO_DA_ATIVIDADE[atividade.tipo]} →
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

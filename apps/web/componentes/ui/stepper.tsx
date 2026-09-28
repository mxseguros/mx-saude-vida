"use client";

/**
 * Stepper (22/09): as etapas de um fluxo, com a atual, as concluídas e as
 * que têm erro.
 *
 * Abaixo de `sm` é uma barra de progresso e a fila de círculos, com o rótulo
 * só na etapa atual — a linha do topo do celular não cabe cinco rótulos. Do
 * `sm` para cima, pílulas com rótulo. Um DOM só; o que muda é classe.
 *
 * TODA etapa é clicável, concluída ou não (pedido de 22/09): a analista está
 * ao telefone e vai para onde a conversa foi, com ou sem os campos anteriores
 * preenchidos. Quem valida é o "Continuar" e o envio, não o clique.
 * `aria-current="step"` na atual, como manda a especificação — é o que o
 * leitor de tela anuncia como "etapa atual".
 */
export type EtapaDoStepper = {
  chave: string;
  rotulo: string;
  /** Rótulo curto para o celular, quando o normal não cabe. */
  curto?: string;
  /** Só no nome acessível: na pílula, "opcional" tirava os cinco itens da mesma linha (22/09). */
  opcional?: boolean;
};

export function Stepper({
  etapas,
  atual,
  erros,
  onIr,
  rotulo = "Etapas",
}: {
  etapas: readonly EtapaDoStepper[];
  atual: number;
  /** Quantos erros há em cada etapa (mesmo tamanho de `etapas`). */
  erros?: number[];
  onIr: (indice: number) => void;
  rotulo?: string;
}) {
  return (
    <nav aria-label={rotulo} className="flex flex-col gap-2">
      <div className="h-1 overflow-hidden rounded-[2px] bg-surface-3 sm:hidden" aria-hidden="true">
        <div
          className="h-full rounded-[2px] bg-brand transition-[width] duration-300"
          style={{ width: `${((atual + 1) / etapas.length) * 100}%` }}
        />
      </div>
      <ol className="m-0 flex list-none flex-nowrap items-center gap-1 p-0 sm:gap-0.5">
        {etapas.map((e, i) => {
          const concluida = i < atual;
          const corrente = i === atual;
          const comErro = (erros?.[i] ?? 0) > 0;
          return (
            <li key={e.chave} className="shrink-0">
              <button
                type="button"
                disabled={corrente}
                onClick={() => onIr(i)}
                aria-current={corrente ? "step" : undefined}
                aria-label={`Etapa ${i + 1} de ${etapas.length}: ${e.rotulo}${e.opcional ? ", opcional" : ""}${
                  comErro ? `, ${erros?.[i]} ${erros?.[i] === 1 ? "erro" : "erros"}` : ""
                }`}
                className={
                  "flex min-h-9 items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 font-(family-name:--font-display) text-[13px] transition-colors disabled:cursor-default " +
                  (corrente
                    ? "bg-brand font-[700] text-on-brand"
                    : concluida
                      ? "font-[600] text-heading hover:bg-surface-2"
                      : "font-[600] text-muted hover:bg-surface-2 hover:text-heading")
                }
              >
                <span
                  className={
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-[12px] font-[700] " +
                    (comErro
                      ? "bg-bad text-white"
                      : concluida
                        ? "bg-sage text-[var(--mx-navy)]"
                        : corrente
                          ? "bg-accent-soft text-on-accent-soft"
                          : "bg-surface-3 text-muted")
                  }
                  aria-hidden="true"
                >
                  {comErro ? "!" : concluida ? "✓" : i + 1}
                </span>
                <span className={corrente ? "" : "hidden sm:inline"}>
                  <span className="sm:hidden">{e.curto ?? e.rotulo}</span>
                  <span className="hidden sm:inline">{e.rotulo}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

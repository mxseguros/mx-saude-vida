"use client";

/**
 * Uma linha da revisão (22/09): rótulo, valor e o "Editar" que leva de volta
 * à etapa. Vazio sai em cinza, nunca em vermelho — nada obrigatório fica para
 * trás sem que a rota diga; o erro, quando há, aparece abaixo do valor.
 */
export function LinhaDeResumo({
  rotulo,
  valor,
  vazio = false,
  erro,
  onEditar,
}: {
  rotulo: string;
  valor: string;
  vazio?: boolean;
  erro?: string | null;
  onEditar?: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line py-2.5 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[12px] text-muted">{rotulo}</span>
        <span className={vazio ? "text-[14.5px] text-muted" : "text-[14.5px] font-[600] text-heading"}>{valor}</span>
        {erro ? (
          <span role="alert" className="text-[12.5px] text-bad">
            {erro}
          </span>
        ) : null}
      </div>
      {onEditar ? (
        <button
          type="button"
          onClick={onEditar}
          aria-label={`Editar ${rotulo.toLowerCase()}`}
          className="shrink-0 py-0.5 font-(family-name:--font-display) text-[13px] font-[700] text-heading underline-offset-2 hover:underline"
        >
          Editar
        </button>
      ) : null}
    </div>
  );
}

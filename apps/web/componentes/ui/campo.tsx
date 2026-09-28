"use client";

import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { useId } from "react";

/**
 * Campo de formulario (§4.4 e §5.7). Altura 42px, anel de foco de 3px.
 *
 * Regra do §5.7: o erro nunca aparece no primeiro caractere. Quem controla
 * quando mostrar e o formulario (no blur ou no envio); este componente so
 * exibe o que recebe. A mensagem fica ligada ao campo por aria-describedby,
 * para leitor de tela ouvir o motivo junto do campo.
 *
 * TEXTO DE 16px NO CELULAR, 15px do `sm` para cima. Nao e preferencia: o
 * Safari do iPhone da zoom automatico ao focar qualquer campo com fonte menor
 * que 16px, e nao desfaz o zoom ao sair. Num formulario de 29 campos a pessoa
 * atravessa o cadastro inteiro com a tela ampliada, arrastando na horizontal
 * para achar cada rotulo.
 */

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  rotulo: string;
  erro?: string | null;
  dica?: string;
  /** Marca o campo como correto depois de validado. */
  valido?: boolean;
  /**
   * Preenchido pelo Agente Apolice (Fase 3): fundo azul-claro ate a analista
   * revisar. A IA sugere e destaca; quem salva e a pessoa.
   */
  destacado?: boolean;
  /**
   * Formata enquanto digita (`lib/dominio/mascaras.ts`).
   *
   * Aplicada ANTES de repassar o evento, entao quem escuta `onChange` ja
   * recebe o valor formatado e o campo controlado nao pisca. E conveniencia:
   * quem recusa e o zod, no servidor.
   */
  mascara?: (entrada: string) => string;
};

export function Campo({
  rotulo,
  erro = null,
  dica,
  valido = false,
  destacado = false,
  mascara,
  className = "",
  required,
  ...resto
}: Props) {
  const id = useId();
  const idErro = `${id}-erro`;
  const idDica = `${id}-dica`;

  const borda = erro
    ? "border-bad"
    : valido
      ? "border-ok"
      : "border-line-strong";

  const descritoPor = [erro ? idErro : null, dica ? idDica : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-[12.5px] font-[600] font-(family-name:--font-display) text-heading"
      >
        {rotulo}
        {required ? <span className="text-bad"> *</span> : null}
      </label>

      <input
        id={id}
        required={required}
        aria-invalid={erro ? true : undefined}
        aria-describedby={descritoPor || undefined}
        className={
          `h-[42px] w-full rounded-[6px] border px-3 text-[16px] sm:text-[14px] ` +
          `text-texto placeholder:text-faint ${borda} ` +
          `${destacado ? "bg-ia-soft" : "bg-surface"} ${className}`
        }
        {...resto}
        onChange={
          mascara
            ? (evento) => {
                evento.target.value = mascara(evento.target.value);
                resto.onChange?.(evento);
              }
            : resto.onChange
        }
      />

      {dica && !erro ? (
        <p id={idDica} className="text-[12.5px] text-muted">
          {dica}
        </p>
      ) : null}

      {erro ? (
        <p id={idErro} role="alert" className="text-[12.5px] text-bad">
          {erro}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Select. Mesma altura, mesma borda e mesmo tratamento de erro do Campo — os
 * formularios do legado misturam texto e selecao na mesma linha, e uma
 * diferenca de 2px entre eles apareceria na hora.
 */
export function Selecao({
  rotulo,
  erro = null,
  dica,
  opcoes,
  vazio = "Selecione",
  className = "",
  required,
  destacado = false,
  ...resto
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> & {
  rotulo: string;
  erro?: string | null;
  dica?: string;
  opcoes: { valor: string | number; rotulo: string }[];
  /** Texto da opcao vazia. Passar null tira a opcao. */
  vazio?: string | null;
  /** Preenchido pelo Agente Apolice: fundo azul-claro ate a analista revisar. */
  destacado?: boolean;
}) {
  const id = useId();
  const idErro = `${id}-erro`;
  const idDica = `${id}-dica`;

  const descritoPor = [erro ? idErro : null, dica ? idDica : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-[12.5px] font-[600] font-(family-name:--font-display) text-heading"
      >
        {rotulo}
        {required ? <span className="text-bad"> *</span> : null}
      </label>

      <select
        id={id}
        required={required}
        aria-invalid={erro ? true : undefined}
        aria-describedby={descritoPor || undefined}
        className={
          `h-[42px] w-full rounded-[6px] border px-3 text-[16px] text-texto sm:text-[14px] ` +
          `${erro ? "border-bad" : "border-line-strong"} ` +
          `${destacado ? "bg-ia-soft" : "bg-surface"} ${className}`
        }
        {...resto}
      >
        {vazio === null ? null : <option value="">{vazio}</option>}
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>

      {dica && !erro ? (
        <p id={idDica} className="text-[12.5px] text-muted">
          {dica}
        </p>
      ) : null}

      {erro ? (
        <p id={idErro} role="alert" className="text-[12.5px] text-bad">
          {erro}
        </p>
      ) : null}
    </div>
  );
}

/** Observacao. O legado tem duas, e as duas sao onde a analista conta a historia. */
export function AreaTexto({
  rotulo,
  erro = null,
  dica,
  linhas = 3,
  className = "",
  required,
  ...resto
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id" | "rows"> & {
  rotulo: string;
  erro?: string | null;
  dica?: string;
  linhas?: number;
}) {
  const id = useId();
  const idErro = `${id}-erro`;
  const idDica = `${id}-dica`;

  const descritoPor = [erro ? idErro : null, dica ? idDica : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-[12.5px] font-[600] font-(family-name:--font-display) text-heading"
      >
        {rotulo}
        {required ? <span className="text-bad"> *</span> : null}
      </label>

      <textarea
        id={id}
        rows={linhas}
        required={required}
        aria-invalid={erro ? true : undefined}
        aria-describedby={descritoPor || undefined}
        className={
          `w-full rounded-[6px] border bg-surface px-3 py-2 text-[16px] sm:text-[14px] ` +
          `text-texto placeholder:text-faint ` +
          `${erro ? "border-bad" : "border-line-strong"} ${className}`
        }
        {...resto}
      />

      {dica && !erro ? (
        <p id={idDica} className="text-[12.5px] text-muted">
          {dica}
        </p>
      ) : null}

      {erro ? (
        <p id={idErro} role="alert" className="text-[12.5px] text-bad">
          {erro}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Caixa de selecao com rotulo e explicacao.
 *
 * Existe para as decisoes que a analista toma DENTRO de uma acao — "notificar
 * o segurado por e-mail" ao mover o cartao. O `motivo` aparece quando a caixa
 * esta desabilitada: caixa cinza sem explicacao faz a pessoa achar que o
 * sistema quebrou, em vez de entender que falta um modelo de e-mail.
 */
export function CaixaDeSelecao({
  rotulo,
  motivo,
  className = "",
  ...resto
}: Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type"> & {
  rotulo: string;
  motivo?: string;
}) {
  const id = useId();

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className={
          "flex items-center gap-2.5 text-[13.5px] " +
          (resto.disabled ? "text-muted" : "cursor-pointer text-texto") +
          ` ${className}`
        }
      >
        <input
          id={id}
          type="checkbox"
          className="size-[18px] shrink-0 accent-[var(--brand)]"
          {...resto}
        />
        {rotulo}
      </label>
      {motivo ? <p className="pl-[28px] text-[12.5px] text-muted">{motivo}</p> : null}
    </div>
  );
}

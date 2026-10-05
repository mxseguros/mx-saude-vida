"use client";

import Image from "next/image";
import { useId } from "react";

/**
 * As peças do formulário de coleta, no visual da página pública da MX.
 *
 * Copiadas por cópia do MX Sinistro, que tem a mesma página para o segurado.
 * Cópia e não dependência: os dois repositórios são separados de propósito, e
 * um `import` entre eles amarraria o deploy de um ao outro.
 *
 * Só para esta rota: não entram em `componentes/ui`, porque a paleta e a
 * tipografia são outras, e um `Botao` que aceita "paper" e "sage" viraria um
 * segundo sistema de design dentro do primeiro. Tudo lê os tokens `--cp-*`
 * de `globals.css`.
 */

/* --------------------------------------------------------------------------
   Ícones — traço, 24 de viewBox, como o handoff
   -------------------------------------------------------------------------- */

const traco = (largura: number) => ({
  fill: "none",
  stroke: "currentColor",
  strokeWidth: largura,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export const Icone = {
  check: ({ tamanho = 16 }: { tamanho?: number }) => (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" aria-hidden="true" {...traco(2.2)}>
      <path d="M5 12.5l4.2 4.2L19 7" />
    </svg>
  ),
  seta: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" {...traco(2)}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
  voltar: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" {...traco(2)}>
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </svg>
  ),
  planilha: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" {...traco(1.6)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M3 14.5h18M9 4v16M15 4v16" />
    </svg>
  ),
  mais: ({ tamanho = 16 }: { tamanho?: number }) => (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" aria-hidden="true" {...traco(2)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  lixeira: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" {...traco(1.8)}>
      <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6" />
    </svg>
  ),
  pessoa: ({ tamanho = 18 }: { tamanho?: number }) => (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" aria-hidden="true" {...traco(1.8)}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20c1.2-4 4-6 7.5-6s6.3 2 7.5 6" />
    </svg>
  ),
  cadeado: ({ tamanho = 14 }: { tamanho?: number }) => (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" aria-hidden="true" {...traco(1.8)}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  ),
  fechar: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" {...traco(2.4)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  editar: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" {...traco(1.8)}>
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z" />
    </svg>
  ),
};

/* --------------------------------------------------------------------------
   Marca
   -------------------------------------------------------------------------- */

const PROPORCAO_LOCKUP = 806 / 135;

export function Logo({ cor, altura }: { cor: "navy" | "branco"; altura: number }) {
  return (
    <Image
      src={cor === "navy" ? "/mx-lockup-navy.png" : "/mx-lockup-branco.png"}
      alt="MX Corretora de seguros"
      width={Math.round(altura * PROPORCAO_LOCKUP)}
      height={altura}
      priority
    />
  );
}

/* --------------------------------------------------------------------------
   Botão
   -------------------------------------------------------------------------- */

const PELE = {
  primario: "bg-[var(--cp-navy)] text-[var(--cp-paper)] border-transparent hover:bg-[var(--cp-navy-2)]",
  fantasma: "bg-transparent text-[var(--cp-navy)] border-[var(--cp-line)] hover:bg-[var(--cp-sky-soft)]",
  texto: "bg-transparent text-[var(--cp-navy)] border-transparent px-2 hover:text-[var(--cp-navy-3)]",
  suave: "bg-[var(--cp-sky-soft)] text-[var(--cp-navy)] border-transparent hover:bg-[var(--cp-sky)]",
} as const;

export function Btn({
  tipo = "primario",
  cheio = false,
  icone,
  className = "",
  children,
  ...resto
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tipo?: keyof typeof PELE;
  cheio?: boolean;
  icone?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      {...resto}
      className={`inline-flex min-h-[52px] items-center justify-center gap-2.5 rounded-[12px] border-[1.5px] px-[22px] text-[15px] font-[600] leading-[1.15] tracking-[-0.005em] transition-colors disabled:opacity-50 ${PELE[tipo]} ${cheio ? "w-full" : ""} ${className}`}
    >
      {children}
      {icone}
    </button>
  );
}

/* --------------------------------------------------------------------------
   Campo
   -------------------------------------------------------------------------- */

export function Campo({
  rotulo,
  erro,
  dica,
  doCadastro = false,
  mono = false,
  className = "",
  ...input
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "id"> & {
  rotulo: string;
  erro?: string | null;
  dica?: string;
  /** O selo "do seu cadastro": veio pré-preenchido. Some quando há erro. */
  doCadastro?: boolean;
  mono?: boolean;
}) {
  const id = useId();
  const idErro = `${id}-erro`;
  const idDica = `${id}-dica`;
  return (
    <div className={`flex flex-col gap-[7px] ${className}`}>
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-[13px] font-[600] tracking-[0.01em] text-[var(--cp-ink)]">
          {rotulo}
        </label>
        {doCadastro && !erro ? (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--cp-ink-2)]">
            <Icone.check tamanho={12} /> do seu cadastro
          </span>
        ) : null}
      </div>
      <input
        id={id}
        {...input}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? idErro : dica ? idDica : undefined}
        className={`cp-input w-full rounded-[12px] border-[1.5px] bg-[var(--cp-white)] px-4 py-[14px] text-[16px] text-[var(--cp-black)] outline-none transition-[border-color,box-shadow] duration-150 ${erro ? "border-[var(--cp-err)]" : "border-[var(--cp-line)]"} ${mono ? "cp-mono" : ""}`}
      />
      {erro ? (
        <span id={idErro} className="flex items-start gap-1.5 text-[13px] leading-[1.4] text-[var(--cp-err)]">
          <span aria-hidden="true" className="mt-[6px] size-1.5 shrink-0 rounded-full bg-[var(--cp-err)]" />
          {erro}
        </span>
      ) : dica ? (
        <span id={idDica} className="text-[12.5px] leading-[1.4] text-[var(--cp-ink-2)]">
          {dica}
        </span>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Aviso, progresso, cabeçalho
   -------------------------------------------------------------------------- */

const TOM = {
  sky: "bg-[var(--cp-sky-soft)]",
  sage: "bg-[var(--cp-sage-soft)]",
  ok: "bg-[var(--cp-ok-soft)]",
} as const;

export function Aviso({
  tom = "sky",
  icone,
  children,
  role,
}: {
  tom?: keyof typeof TOM;
  icone?: React.ReactNode;
  children: React.ReactNode;
  role?: "status" | "alert";
}) {
  return (
    <div
      role={role}
      className={`flex items-start gap-3 rounded-[14px] px-4 py-3.5 text-[14px] leading-[1.5] text-[var(--cp-ink)] ${TOM[tom]}`}
    >
      {icone ? <span className="mt-0.5 shrink-0 text-[var(--cp-navy)]">{icone}</span> : null}
      <div>{children}</div>
    </div>
  );
}

/** O aviso de privacidade que aparece junto dos documentos e do envio. */
export function AvisoDeSeguranca({ children }: { children: React.ReactNode }) {
  return (
    <Aviso tom="sage" icone={<Icone.cadeado />}>
      {children}
    </Aviso>
  );
}

export function Progresso({ valor }: { valor: number }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(valor)}
      aria-label="Progresso do formulário"
      className="h-[3px] overflow-hidden rounded-[2px] bg-[var(--cp-line)]"
    >
      <div className="cp-progresso h-full rounded-[2px] bg-[var(--cp-navy)]" style={{ width: `${valor}%` }} />
    </div>
  );
}

export function Cabecalho({
  eyebrow,
  titulo,
  lead,
}: {
  eyebrow: string;
  titulo: string;
  lead: string;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-[12.5px] font-[600] uppercase tracking-[0.06em] text-[var(--cp-ink-2)]">{eyebrow}</span>
      <h1 className="m-0 text-[27px] font-[600] leading-[1.12] tracking-[-0.025em] text-balance text-[var(--cp-navy)] md:text-[36px]">
        {titulo}
      </h1>
      <p className="m-0 text-[15px] leading-[1.55] text-pretty text-[var(--cp-ink)] md:text-[16.5px]">{lead}</p>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Upload: a vaga da planilha
   -------------------------------------------------------------------------- */

export function VagaDeUpload({
  rotulo,
  estado,
  desabilitada = false,
  dicaDesabilitada,
  progresso,
  nome,
  onEscolher,
  deQue = "da planilha",
}: {
  rotulo: string;
  /** Completa o nome acessível: "Planilha do mês". */
  deQue?: string;
  estado: "vazia" | "subindo" | "enviada";
  desabilitada?: boolean;
  dicaDesabilitada?: string;
  progresso?: number;
  nome?: string;
  onEscolher: () => void;
}) {
  const enviada = estado === "enviada";
  const sub =
    estado === "subindo"
      ? `Enviando… ${progresso ?? 0}%`
      : enviada
        ? "Enviada · toque para trocar"
        : desabilitada
          ? (dicaDesabilitada ?? "")
          : "Excel ou CSV · até 10 MB";
  return (
    <button
      type="button"
      onClick={onEscolher}
      disabled={desabilitada || estado === "subindo"}
      aria-label={`${rotulo}${deQue ? ` ${deQue}` : ""}${nome ? `: ${nome}` : ""}`}
      className={`flex w-full items-center gap-3.5 rounded-[14px] border-[1.5px] p-4 text-left transition-colors ${
        enviada
          ? "border-solid border-[var(--cp-sage)] bg-[var(--cp-sage-soft)]"
          : "border-dashed border-[var(--cp-line)] bg-[var(--cp-white)]"
      } ${desabilitada ? "opacity-55" : ""}`}
    >
      <span
        className={`flex size-11 shrink-0 items-center justify-center rounded-[12px] ${
          enviada ? "bg-[var(--cp-sage)] text-[var(--cp-paper)]" : "bg-[var(--cp-sky-soft)] text-[var(--cp-navy)]"
        }`}
      >
        {enviada ? <Icone.check /> : <Icone.planilha />}
      </span>
      <span className="flex flex-1 flex-col gap-[3px]">
        <span className="text-[15px] font-[600] text-[var(--cp-black)]">{rotulo}</span>
        <span className="text-[12.5px] text-[var(--cp-ink-2)]">{sub}</span>
      </span>
      {!enviada && !desabilitada && estado !== "subindo" ? (
        <span className="text-[13px] font-[600] text-[var(--cp-navy)]">Escolher</span>
      ) : null}
    </button>
  );
}

/* --------------------------------------------------------------------------
   Revisão
   -------------------------------------------------------------------------- */

export function LinhaDeRevisao({
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
  onEditar: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[var(--cp-line-soft)] py-3.5">
      <div className="flex flex-col gap-[3px]">
        <span className="text-[12px] text-[var(--cp-ink-2)]">{rotulo}</span>
        <span className={vazio ? "text-[15px] text-[var(--cp-ink-2)]" : "text-[15px] font-[500] text-[var(--cp-black)]"}>
          {valor}
        </span>
        {erro ? <span className="text-[12.5px] text-[var(--cp-err)]">{erro}</span> : null}
      </div>
      <button
        type="button"
        onClick={onEditar}
        aria-label={`Editar ${rotulo.toLowerCase()}`}
        className="inline-flex shrink-0 items-center gap-1.5 py-0.5 text-[13px] font-[600] text-[var(--cp-navy)]"
      >
        <Icone.editar />
        Editar
      </button>
    </div>
  );
}

/* --------------------------------------------------------------------------
   O stepper em pílulas
   -------------------------------------------------------------------------- */

/**
 * As cinco etapas, em pílulas.
 *
 * Não é navegação: as pílulas não são clicáveis. Quem quer voltar usa o
 * "Voltar" da etapa, e quem quer corrigir usa o "Editar" da revisão — dois
 * caminhos, e os dois passam por uma tela que mostra o que vai mudar. Pílula
 * clicável convidaria o gestor a pular a etapa 4 e chegar à revisão sem a
 * planilha, e ele descobriria isso no erro.
 *
 * O nome de cada etapa aparece inteiro só no desktop. No celular sobra a
 * pílula com o número — e o `aria-label` carrega o nome, que é o que o leitor
 * de tela anuncia.
 */
export function Pilulas({ etapas, atual }: { etapas: readonly string[]; atual: number }) {
  return (
    <ol className="m-0 flex list-none items-center gap-1.5 p-0">
      {etapas.map((nome, i) => {
        const cumprida = i < atual;
        const agora = i === atual;
        return (
          <li
            key={nome}
            aria-current={agora ? "step" : undefined}
            aria-label={`Etapa ${i + 1} de ${etapas.length}: ${nome}${cumprida ? " (preenchida)" : ""}`}
            className={`flex min-h-[28px] items-center gap-1.5 rounded-full px-2.5 text-[12px] font-[600] leading-none transition-colors ${
              agora
                ? "bg-[var(--cp-navy)] text-[var(--cp-paper)]"
                : cumprida
                  ? "bg-[var(--cp-sky-soft)] text-[var(--cp-navy)]"
                  : "bg-[var(--cp-line-soft)] text-[var(--cp-ink-2)]"
            }`}
          >
            <span aria-hidden="true">{cumprida ? <Icone.check tamanho={12} /> : i + 1}</span>
            <span aria-hidden="true" className="hidden md:inline">
              {nome}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* --------------------------------------------------------------------------
   O cartão de pessoa
   -------------------------------------------------------------------------- */

/**
 * Nome e CPF de uma pessoa, com o botão de remover.
 *
 * Cartão e não linha de tabela: no celular uma tabela de duas colunas com CPF
 * não cabe sem rolar de lado, e a regra do projeto é que tabela não rola de
 * lado. Aqui cada pessoa é um bloco que empilha.
 */
export function CartaoDePessoa({
  indice,
  deQue,
  nome,
  documento,
  erroNome,
  erroDocumento,
  onNome,
  onDocumento,
  onRemover,
}: {
  indice: number;
  /** "entrou" | "saiu" — completa o nome acessível dos controles. */
  deQue: string;
  nome: string;
  documento: string;
  erroNome?: string | null;
  erroDocumento?: string | null;
  onNome: (valor: string) => void;
  onDocumento: (valor: string) => void;
  onRemover: () => void;
}) {
  return (
    <li className="flex flex-col gap-3 rounded-[14px] border-[1.5px] border-[var(--cp-line)] bg-[var(--cp-white)] p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[12.5px] font-[600] uppercase tracking-[0.05em] text-[var(--cp-ink-2)]">
          <Icone.pessoa tamanho={15} />
          {indice + 1}ª pessoa
        </span>
        <button
          type="button"
          onClick={onRemover}
          aria-label={`Remover a ${indice + 1}ª pessoa que ${deQue}`}
          className="inline-flex min-h-[32px] items-center gap-1.5 rounded-[8px] px-2 text-[13px] font-[600] text-[var(--cp-err)]"
        >
          <Icone.lixeira />
          Remover
        </button>
      </div>

      <Campo
        rotulo="Nome completo"
        value={nome}
        onChange={(e) => onNome(e.target.value)}
        erro={erroNome}
        autoComplete="off"
        enterKeyHint="next"
        placeholder="Como está no documento"
      />

      <Campo
        rotulo="CPF"
        value={documento}
        onChange={(e) => onDocumento(e.target.value)}
        erro={erroDocumento}
        mono
        inputMode="numeric"
        autoComplete="off"
        enterKeyHint="next"
        placeholder="000.000.000-00"
        dica="Se não tiver em mãos, deixe em branco — a MX completa pela planilha."
      />
    </li>
  );
}

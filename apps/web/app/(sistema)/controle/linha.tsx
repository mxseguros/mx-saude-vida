import {
  aparenciaDaData,
  ROTULO_DATA,
  ROTULO_PASSO,
  type AparenciaDaData,
  type ChaveDeData,
  type Passo,
} from "@/lib/dominio/controle";
import { ROTULO_MODELO } from "@/lib/dominio/mensagem";
import Link from "next/link";

import { nomeCurto } from "@/lib/dominio/cliente";
import type { LinhaDoControle } from "@/lib/controles/consulta";

/**
 * As peças da linha do Controle, compartilhadas entre a tabela do desktop e o
 * cartão do celular — as duas mostram a mesma coisa, e divergir aqui seria a
 * versão do celular envelhecer sozinha.
 */

/**
 * A cor de uma data.
 *
 * Prazo vencido é FONTE vermelha, nunca fundo vermelho: com quatro datas por
 * linha e dezenas de linhas, fundo colorido vira uma parede que não se lê.
 * Só a data do passo atual ganha cor; as cumpridas saem riscadas e as futuras
 * em cinza, para o olho achar onde o mês está.
 */
const COR_DA_DATA: Record<AparenciaDaData, string> = {
  sem_data: "text-faint",
  cumprida: "text-faint line-through",
  futura: "text-muted",
  no_prazo: "font-[700] text-brand",
  perto: "font-[700] text-warn",
  hoje: "font-[700] text-bad",
  vencido: "font-[700] text-bad",
};

const EXPLICACAO: Record<AparenciaDaData, string> = {
  sem_data: "esta apólice não tem esta etapa",
  cumprida: "já cumprida",
  futura: "ainda vem",
  no_prazo: "etapa atual, no prazo",
  perto: "vence em até 3 dias",
  hoje: "vence hoje",
  vencido: "prazo vencido",
};

export function Data({ chave, linha, hoje }: { chave: ChaveDeData; linha: LinhaDoControle; hoje: string }) {
  const valor = linha.datas[chave];
  const aparencia = aparenciaDaData(chave, linha.passo, linha.datas, hoje);

  return (
    <span className={`tabular ${COR_DA_DATA[aparencia]}`} title={`${ROTULO_DATA[chave]}: ${EXPLICACAO[aparencia]}`}>
      {valor ? `${valor.slice(8, 10)}/${valor.slice(5, 7)}` : "—"}
    </span>
  );
}

const COR_DO_PASSO: Record<Passo, string> = {
  informar: "bg-surface-3 text-muted",
  planilha_recebida: "bg-warn-soft text-warn",
  conferida: "bg-accent-soft text-on-accent-soft",
  corte: "bg-accent-soft text-on-accent-soft",
  boleto: "bg-accent-soft text-on-accent-soft",
  vencimento: "bg-accent-soft text-on-accent-soft",
  concluida: "bg-ok-soft text-ok",
};

export function Etiqueta({ passo }: { passo: Passo }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11.5px] font-[600] ${COR_DO_PASSO[passo]}`}
    >
      {ROTULO_PASSO[passo]}
    </span>
  );
}

export function Nome({ linha }: { linha: LinhaDoControle }) {
  return (
    <Link
      href={`/clientes/${linha.clienteId}`}
      className="font-[600] text-heading underline-offset-2 hover:underline"
      title={linha.observacoes ?? "Abrir o cadastro do cliente"}
    >
      {nomeCurto({ razaoSocial: linha.razaoSocial, nomeFantasia: linha.nomeFantasia })}
    </Link>
  );
}

/**
 * "22/09 · WhatsApp · Boleto", ou o que o link de coleta já contou.
 *
 * O ESTADO DO LINK VENCE a última mensagem quando há um aberto, e é deliberado:
 * em `informar` a pergunta da analista não é "o que eu mandei?", é "ele
 * respondeu?". "22/09 · WhatsApp · Informar" diz que a mensagem saiu; "abriu e
 * não enviou" diz que ela chegou, foi lida, e o mês continua parado — que é a
 * linha que precisa de um telefonema.
 *
 * Sem link, volta a mostrar a mensagem: nos outros passos é isso que importa.
 */
export function UltimaMensagem({ linha }: { linha: LinhaDoControle }) {
  const { coleta } = linha;

  if (coleta.temLink && !linha.recebidaEm) {
    return (
      <span className={coleta.abertoEm ? "text-texto" : "text-muted"}>
        {coleta.abertoEm
          ? `link aberto ${curta(coleta.abertoEm)} · sem resposta`
          : `link enviado${coleta.valeAte ? ` · vale até ${curta(coleta.valeAte)}` : ""}`}
      </span>
    );
  }

  if (!linha.ultimaMensagem) return <span className="text-faint">—</span>;

  const { em, canal, modelo } = linha.ultimaMensagem;
  return (
    <span className="text-muted">
      {curta(em)} · {canal === "email" ? "e-mail" : "WhatsApp"} · {ROTULO_MODELO[modelo]}
    </span>
  );
}

/** `2026-09-22T…` → `22/09`. A coluna é estreita, e o ano é sempre o corrente. */
function curta(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

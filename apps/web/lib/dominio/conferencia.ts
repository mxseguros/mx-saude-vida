/**
 * O cruzamento entre o que o gestor INFORMOU e o que a planilha TRAZ.
 *
 * Puro, como o resto do domínio: sem I/O, sem relógio. "Hoje" entra por
 * parâmetro em ISO (`AAAA-MM-DD`), já no fuso de São Paulo.
 *
 * NADA AQUI IMPEDE CONFERIR, e é a regra que organiza o arquivo. Cada achado é
 * um APONTAMENTO: a tela mostra, e quem decide é a analista. Bloquear seria
 * errado em todos os quatro casos — a planilha pode ter chegado incompleta, o
 * gestor pode ter esquecido de listar alguém que de fato entrou, o CPF repetido
 * pode ser a pessoa que saiu e voltou no mesmo mês, e admissão sem data é
 * comum em folha que não exporta a coluna.
 *
 * O que se cruza é só o que o GESTOR informou. O que a analista digitou ela já
 * sabe de onde veio — e cruzar isso geraria apontamento que ninguém resolve.
 */

import { formatarDocumento } from "./documento";
import type { LinhaDaPlanilha } from "./planilha";

/* --------------------------------------------------------------------------
   Os quatro apontamentos
   -------------------------------------------------------------------------- */

export type TipoDeApontamento =
  /** O gestor informou um CPF que não aparece na planilha. */
  | "fora_da_planilha"
  /** A planilha traz alguém que o gestor não informou. */
  | "fora_do_informado"
  /** O mesmo CPF informado duas vezes pelo gestor. */
  | "cpf_repetido"
  /** Entrada sem data de admissão na planilha. */
  | "sem_admissao";

export type Apontamento = {
  tipo: TipoDeApontamento;
  /** O nome, para a analista reconhecer a pessoa. */
  nome: string;
  /** Formatado para a tela. Vazio quando não há CPF. */
  documento: string;
  /** A linha do Excel, quando o achado vem da planilha. */
  linha?: number;
  mensagem: string;
};

export const ROTULO_APONTAMENTO: Record<TipoDeApontamento, string> = {
  fora_da_planilha: "Informado e não está na planilha",
  fora_do_informado: "Na planilha e não foi informado",
  cpf_repetido: "CPF informado duas vezes",
  sem_admissao: "Entrada sem data de admissão",
};

/** O que o gestor informou, como a conferência precisa ver. */
export type Informado = {
  tipo: "entrada" | "saida";
  nome: string;
  /** Só dígitos, ou `null` quando ele não tinha à mão. */
  documento: string | null;
};

export type Conferencia = {
  apontamentos: Apontamento[];
  /** Quantos CPFs informados a planilha confirma. */
  conferem: number;
  /**
   * Pessoas que o gestor informou SEM CPF.
   *
   * Contadas e não apontadas: o formulário aceita nome sem CPF de propósito, e
   * transformar isso em apontamento daria um alerta por pessoa num mês em que o
   * gestor simplesmente não tinha os documentos à mão. A tela diz quantas são,
   * e a analista completa pela planilha.
   */
  semDocumento: number;
};

/* --------------------------------------------------------------------------
   O cruzamento
   -------------------------------------------------------------------------- */

/**
 * Cruza o informado com a planilha.
 *
 * A CHAVE É O CPF, e não o nome. Nome é digitado por duas pessoas diferentes —
 * o gestor no celular e quem monta a folha — e "José da Silva" contra "Jose
 * Silva" geraria apontamento em metade das linhas. CPF tem dígito verificador:
 * quando casa, casou.
 *
 * Quem o gestor informou sem CPF fica fora do cruzamento, nos dois sentidos:
 * não vira "fora da planilha" (não há como saber) e não faz a pessoa da
 * planilha virar "não informada" por engano.
 *
 * `hoje` entra porque a admissão FUTURA não é falta de dado: quem é admitido no
 * dia 1º do mês que vem já entra na movimentação deste, e apontar isso seria
 * pedir correção de algo certo.
 */
export function conferir(
  informado: readonly Informado[],
  planilha: readonly LinhaDaPlanilha[],
  hoje: string,
): Conferencia {
  const apontamentos: Apontamento[] = [];

  const comDocumento = informado.filter((p): p is Informado & { documento: string } => p.documento !== null);
  const semDocumento = informado.length - comDocumento.length;

  /* 1 · CPF informado duas vezes ------------------------------------------ */

  const vezes = new Map<string, Informado[]>();
  for (const pessoa of comDocumento) {
    const lista = vezes.get(pessoa.documento) ?? [];
    lista.push(pessoa);
    vezes.set(pessoa.documento, lista);
  }

  for (const [documento, pessoas] of vezes) {
    if (pessoas.length < 2) continue;

    // Entrada E saída do mesmo CPF é um caso REAL: a pessoa saiu e voltou no
    // mês, ou trocou de contrato. A mensagem diz isso em vez de acusar erro,
    // porque acusar o que é normal ensina a analista a ignorar o alerta.
    const tipos = new Set(pessoas.map((p) => p.tipo));
    apontamentos.push({
      tipo: "cpf_repetido",
      nome: pessoas[0]?.nome ?? "",
      documento: formatarDocumento(documento),
      mensagem:
        tipos.size > 1
          ? "Informado como entrada E como saída. Pode ser quem saiu e voltou no mês — confirme com o gestor."
          : `Informado ${pessoas.length} vezes como ${pessoas[0]?.tipo === "entrada" ? "entrada" : "saída"}.`,
    });
  }

  /* 2 · Informado e não está na planilha ---------------------------------- */

  const naPlanilha = new Map<string, LinhaDaPlanilha>();
  for (const linha of planilha) {
    if (linha.cpf) naPlanilha.set(linha.cpf, linha);
  }

  let conferem = 0;

  for (const pessoa of comDocumento) {
    const linha = naPlanilha.get(pessoa.documento);

    if (!linha) {
      apontamentos.push({
        tipo: "fora_da_planilha",
        nome: pessoa.nome,
        documento: formatarDocumento(pessoa.documento),
        mensagem:
          pessoa.tipo === "entrada"
            ? "O gestor informou esta entrada, mas a planilha não traz esta pessoa."
            : "O gestor informou esta saída, mas a planilha não traz esta pessoa.",
      });
      continue;
    }

    conferem += 1;

    /* 3 · Entrada sem data de admissão ------------------------------------ */

    if (pessoa.tipo === "entrada" && !linha.admissao) {
      apontamentos.push({
        tipo: "sem_admissao",
        nome: linha.nome ?? pessoa.nome,
        documento: formatarDocumento(pessoa.documento),
        linha: linha.numero,
        mensagem: "A seguradora cobra pró-rata pela admissão. Sem a data, o mês inteiro é cobrado.",
      });
    }
  }

  /* 4 · Na planilha e não foi informado ----------------------------------- */

  const informados = new Set(comDocumento.map((p) => p.documento));

  for (const linha of planilha) {
    if (!linha.cpf || informados.has(linha.cpf)) continue;

    /**
     * A planilha é a FOTO do mês, não a lista de quem mudou.
     *
     * Quase todo cliente manda a relação inteira de vidas, e apontar cada uma
     * como "não informada" daria cem alertas num mês de duas entradas. Só vira
     * apontamento quem a própria planilha marca como novo — admissão DENTRO do
     * mês que se está conferindo.
     */
     if (!linha.admissao) continue;
     if (!admitidoNoMes(linha.admissao, hoje)) continue;

    apontamentos.push({
      tipo: "fora_do_informado",
      nome: linha.nome ?? "",
      documento: formatarDocumento(linha.cpf),
      linha: linha.numero,
      mensagem: `Admitida em ${diaEMes(linha.admissao)} e não consta no que o gestor informou.`,
    });
  }

  return { apontamentos: ordenar(apontamentos), conferem, semDocumento };
}

/* --------------------------------------------------------------------------
   Pedaços
   -------------------------------------------------------------------------- */

/**
 * Admitida no mês que se está conferindo.
 *
 * O mês é o de `hoje`, e não o da competência: a analista confere a planilha de
 * setembro em setembro ou nos primeiros dias de outubro, e nos dois casos é a
 * admissão de setembro que interessa. Comparar com a competência exigiria
 * passá-la até aqui para resolver o mesmo caso.
 */
function admitidoNoMes(admissao: string, hoje: string): boolean {
  return admissao.slice(0, 7) === hoje.slice(0, 7);
}

/** `2026-09-14` → `14/09`. */
function diaEMes(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/**
 * A ordem em que a analista resolve.
 *
 * Primeiro o que muda a fatura — pessoa informada que a planilha não tem, e
 * pessoa nova que ninguém informou —, depois o que muda o valor (pró-rata), e
 * por fim o que provavelmente é normal (CPF repetido). Lista ordenada por tipo
 * de problema é lista que se resolve de cima para baixo.
 */
const PESO: Record<TipoDeApontamento, number> = {
  fora_da_planilha: 0,
  fora_do_informado: 1,
  sem_admissao: 2,
  cpf_repetido: 3,
};

function ordenar(apontamentos: Apontamento[]): Apontamento[] {
  return [...apontamentos].sort((a, b) => PESO[a.tipo] - PESO[b.tipo] || a.nome.localeCompare(b.nome, "pt-BR"));
}

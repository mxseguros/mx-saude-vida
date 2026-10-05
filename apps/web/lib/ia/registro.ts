import "server-only";

import { clienteServidor } from "../supabase/servidor";
import {
  cacheAindaVale,
  custoEmReal,
  excedeuTetoDiario,
  type Uso,
} from "./custo";

/**
 * Registro de execuções de IA.
 *
 * Toda chamada é gravada em `ai_runs`, com tokens, custo e — depois — se a
 * analista aceitou a sugestão. A **taxa de aceite é a métrica de qualidade do
 * agente**: sem ela, saber se a IA ajuda ou atrapalha vira opinião.
 *
 * O sinal contraintuitivo, que vale registrar antes de alguém comemorar: taxa
 * de aceite muito alta não é necessariamente sucesso. Pode ser a analista
 * tendo parado de conferir — o guardrail "humano no meio" se dissolvendo em
 * silêncio.
 */

function cotacao(): number {
  const valor = Number(process.env.AI_USD_BRL);
  // Padrão conservador: superestimar o custo é melhor do que subestimar, que é
  // como se descobre o problema na fatura.
  return Number.isFinite(valor) && valor > 0 ? valor : 5.5;
}

export type Agente = "apolice" | "triagem" | "vigia";

export type Execucao = {
  clienteId: string | null;
  agente: Agente;
  promptId?: number | null;
  entradaResumo: string;
  saida: unknown;
  modelo: string;
  uso: Uso;
  /** Quem disparou. Base do teto diario — o por cliente nao cobre a apolice. */
  pessoaId?: string | null;
  /** SHA-256 do arquivo, quando houve arquivo. Chave do cache. */
  hash?: string | null;
};

/**
 * Grava a execução e devolve o id, para o aceite ser marcado depois.
 *
 * Nunca lança: perder o registro é ruim, mas derrubar a leitura da apólice
 * porque o log falhou seria pior. O que não pode acontecer em silêncio é a
 * execução — essa a analista vê na tela.
 */
export async function registrar(execucao: Execucao): Promise<number | null> {
  try {
    const supabase = await clienteServidor();

    const { data } = await supabase
      .from("ai_runs")
      .insert({
        client_id: execucao.clienteId,
        agent: execucao.agente,
        prompt_id: execucao.promptId ?? null,
        input_summary: execucao.entradaResumo.slice(0, 500),
        output: execucao.saida,
        model: execucao.modelo,
        tokens: execucao.uso.entrada + execucao.uso.saida,
        cost_brl: custoEmReal(execucao.modelo, execucao.uso, cotacao()),
        accepted: null,
        created_by: execucao.pessoaId ?? null,
        input_hash: execucao.hash ?? null,
      })
      .select("id")
      .single();

    return (data?.id as number) ?? null;
  } catch {
    return null;
  }
}

/**
 * Marca se a sugestão foi aceita.
 *
 * `false` explícito importa tanto quanto `true`: sem registrar a recusa, a
 * taxa de aceite viraria "das que alguém se deu ao trabalho de aceitar", que
 * não mede nada.
 */
export async function marcarAceite(
  execucaoId: number,
  aceito: boolean,
): Promise<void> {
  try {
    const supabase = await clienteServidor();
    await supabase.from("ai_runs").update({ accepted: aceito }).eq("id", execucaoId);
  } catch {
    // Silencioso de propósito: o aceite é telemetria, não a ação da analista.
  }
}

/**
 * O prompt ativo do agente, com sua versão.
 *
 * Vem do banco porque Configurações versiona prompt sem deploy, e porque a
 * execução precisa registrar QUAL versão produziu aquela saída — sem isso não
 * dá para explicar uma extração de três meses atrás.
 */
/**
 * O minimo que `promptAtivo` usa. Evita `any` e evita importar o tipo do
 * cliente administrador aqui — os dois clientes do Supabase servem.
 */
type ClienteDeLeitura = Awaited<ReturnType<typeof clienteServidor>>;

export async function promptAtivo(
  agente: Agente,
  padrao: string,
  // O CRON nao tem sessao, e `ai_prompts_select` exige membro ativo: com o
  // cliente de sessao a consulta volta vazia e o Vigia cai no padrao EM
  // SILENCIO — o prompt que o gestor salvou nunca rodaria. Quem chama de um
  // job passa o cliente administrador.
  cliente?: ClienteDeLeitura,
): Promise<{ id: number | null; texto: string }> {
  try {
    const supabase = cliente ?? (await clienteServidor());
    const { data } = await supabase
      .from("ai_prompts")
      .select("id, prompt")
      .eq("agent", agente)
      .eq("active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) return { id: null, texto: padrao };
    return { id: data.id as number, texto: data.prompt as string };
  } catch {
    return { id: null, texto: padrao };
  }
}

/* --------------------------------------------------------------------------
   Teto diario por pessoa
   -------------------------------------------------------------------------- */

/**
 * Quanto esta pessoa já gastou de IA hoje.
 *
 * Soma no BANCO, por `gasto_ia_do_dia`, e não aqui: o corte do dia tem que ser
 * `local_today()`. Filtrar por data no TypeScript contra UTC zeraria o teto às
 * 21h em vez da meia-noite — e o erro só apareceria na conta do fim do mês.
 */
export async function gastoDoDia(pessoaId: string): Promise<number> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase.rpc("gasto_ia_do_dia", {
      pessoa: pessoaId,
    });

    if (error) return Number.POSITIVE_INFINITY;
    return Number(data ?? 0);
  } catch {
    // Mesma regra de `gastoDoTicket`: sem saber quanto se gastou, o teto
    // FECHA. Devolver 0 desligaria o limite justamente quando não há medida.
    return Number.POSITIVE_INFINITY;
  }
}

export async function podeGastarHoje(pessoaId: string): Promise<boolean> {
  return !excedeuTetoDiario(await gastoDoDia(pessoaId));
}

/**
 * A leitura automática está disponível AGORA, e por quê não (18/09).
 *
 * Serve à tela, não à rota: o formulário precisa dizer que a zona de arrastar
 * não vai funcionar ANTES de a analista arrastar o PDF — a mesma regra dos
 * becos sem saída de 17/09. Quem recusa de verdade continua sendo a rota.
 *
 * As duas causas são diferentes e a mensagem também tem que ser: sem chave, o
 * administrador resolve; no teto, é esperar o dia virar. Dizer só
 * \"indisponível\" mandaria a analista procurar defeito onde não há.
 */
export type SituacaoDaLeitura = { disponivel: boolean; motivo: "sem_chave" | "teto" | null };

export async function situacaoDaLeitura(pessoaId: string): Promise<SituacaoDaLeitura> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { disponivel: false, motivo: "sem_chave" };
  }
  if (!(await podeGastarHoje(pessoaId))) {
    return { disponivel: false, motivo: "teto" };
  }
  return { disponivel: true, motivo: null };
}

/* --------------------------------------------------------------------------
   Cache de extracao por hash
   -------------------------------------------------------------------------- */

/**
 * A extração que já foi feita deste mesmo arquivo.
 *
 * O hash é do conteúdo, então "mesmo arquivo" é literal: reenviar a apólice —
 * o gesto de quem achou que o upload não pegou — não paga de novo.
 *
 * Devolve `null` em qualquer dúvida. Cache é otimização: quando ele falha, o
 * certo é pagar a chamada, nunca devolver resposta duvidosa.
 */
export async function extracaoNoCache(
  agente: Agente,
  hash: string,
): Promise<unknown | null> {
  try {
    const supabase = await clienteServidor();

    const { data } = await supabase
      .from("ai_runs")
      .select("output, created_at")
      .eq("agent", agente)
      .eq("input_hash", hash)
      .not("output", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) return null;

    const linha = data as { output: unknown; created_at: string };
    // Documento não muda; modelo e prompt mudam. Extração velha demais foi
    // produzida por uma versão que talvez não exista mais.
    if (!cacheAindaVale(linha.created_at)) return null;

    return linha.output;
  } catch {
    return null;
  }
}

import "server-only";

import { clienteAdministrador } from "../supabase/administrador";
import { registrarLog } from "../log";

/**
 * Retenção de dado pessoal (LGPD art. 16), executada pelo cron.
 *
 * A planilha de vidas tem nome, CPF e nascimento de cada funcionário do
 * cliente, e `movements` guarda a transcrição disso — nome e CPF de quem entrou
 * e de quem saiu. Dado que não precisa mais existir é dado que pode vazar.
 *
 * A ORDEM É O PONTO DESTE MÓDULO: apaga o OBJETO no Storage primeiro, e só
 * depois marca a ficha. Invertido, uma falha no Storage deixaria a ficha
 * marcada como removida e o arquivo com o CPF ainda no bucket — a tela diria
 * que apagou, e não teria apagado. Assim, o pior caso é a ficha continuar
 * visível com o objeto já fora: a próxima execução tenta de novo.
 *
 * Roda com a chave de administração porque não há sessão às 7h, e porque a
 * política de `delete` no Storage é só do administrador.
 */

export type ResumoDaRetencao = {
  /** Fichas marcadas como removidas. */
  removidos: number;
  /** Objetos que o Storage não apagou: a ficha fica para a próxima rodada. */
  falhas: number;
  /** Quantos estavam vencidos quando o job olhou. */
  vencidos: number;
  /** Linhas de movimentação apagadas: nome e CPF de quem entrou e saiu. */
  movimentacao: number;
};

/** Teto por execução. Mil arquivos de uma vez estourariam o tempo da função. */
const POR_RODADA = 200;

const BUCKET = "client-files";

export async function aplicarRetencao(
  supabase: ReturnType<typeof clienteAdministrador>,
): Promise<ResumoDaRetencao> {
  const resumo: ResumoDaRetencao = { removidos: 0, falhas: 0, vencidos: 0, movimentacao: 0 };

  // ANTES dos arquivos, e fora do `try` deles: a movimentação não depende do
  // Storage, e uma falha de bucket não pode ser motivo para o CPF digitado
  // continuar no banco mais um mês.
  resumo.movimentacao = await limparMovimentacao(supabase);

  try {
    const { data, error } = await supabase
      .from("v_files_to_purge")
      .select("id, storage_path, kind")
      .limit(POR_RODADA);

    if (error) {
      registrarLog("erro", "retencao.leitura", { codigo: error.code });
      return resumo;
    }

    const vencidos = (data ?? []) as { id: string; storage_path: string; kind: string }[];
    resumo.vencidos = vencidos.length;
    if (!vencidos.length) return resumo;

    // Um `remove` com a lista inteira: o Storage aceita em lote, e 200
    // chamadas separadas gastariam o tempo da função em ida e volta.
    const caminhos = vencidos.map((v) => v.storage_path);
    const { error: erroStorage } = await supabase.storage.from(BUCKET).remove(caminhos);

    if (erroStorage) {
      // Nenhuma ficha é marcada: sem o objeto fora do bucket, marcar seria
      // mentir. A próxima rodada tenta de novo.
      registrarLog("erro", "retencao.storage", { codigo: erroStorage.name });
      resumo.falhas = vencidos.length;
      return resumo;
    }

    for (const arquivo of vencidos) {
      const { data: marcou, error: erroMarca } = await supabase.rpc("marcar_arquivo_removido", {
        p_arquivo: arquivo.id,
        p_motivo: "retencao",
      });

      if (erroMarca || marcou !== true) resumo.falhas += 1;
      else resumo.removidos += 1;
    }

    // O log leva CONTAGEM, nunca caminho: o caminho começa pelo `client_id`.
    registrarLog("info", "retencao", {
      removidos: resumo.removidos,
      falhas: resumo.falhas,
    });

    return resumo;
  } catch {
    registrarLog("erro", "retencao.falhou", {});
    return resumo;
  }
}

/**
 * A movimentação vencida, pelo prazo da planilha.
 *
 * A conta e o prazo moram no banco (`limpar_movimentacao_vencida`), que lê
 * `retention_rules`: prazo de retenção é decisão de negócio, e muda com
 * orientação jurídica sem deploy. O que mora aqui é só quando chamar.
 */
async function limparMovimentacao(supabase: ReturnType<typeof clienteAdministrador>): Promise<number> {
  try {
    // Funcionários demitidos há mais que o prazo saem junto: mesmo dado, mesmo prazo.
    const { error: erroFuncionarios } = await supabase.rpc("limpar_funcionarios_vencidos");
    if (erroFuncionarios) registrarLog("erro", "retencao.funcionarios", { codigo: erroFuncionarios.code });

    const { data, error } = await supabase.rpc("limpar_movimentacao_vencida");

    if (error) {
      registrarLog("erro", "retencao.movimentacao", { codigo: error.code });
      return 0;
    }

    const apagadas = typeof data === "number" ? data : 0;
    if (apagadas > 0) registrarLog("info", "retencao.movimentacao", { apagadas });
    return apagadas;
  } catch {
    registrarLog("erro", "retencao.movimentacao_falhou", {});
    return 0;
  }
}

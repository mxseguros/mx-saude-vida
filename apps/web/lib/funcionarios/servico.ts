import "server-only";

import type { Falha, ResultadoEscrita } from "../clientes/servico";
import { COLUNAS_FUNCIONARIO, deFuncionario, paraFuncionario, type LinhaFuncionario } from "../dominio/mapear";
import type { DadosDoFuncionario, Funcionario, PlanoDeImportacao } from "../dominio/funcionario";
import { clienteServidor } from "../supabase/servidor";

const falhaGenerica: Falha = { status: 503, codigo: "banco_indisponivel", mensagem: "Não foi possível salvar agora. Tente de novo." };

/** CPF ativo repetido vem do índice único: a mensagem diz o que fazer. */
function falhaDoBanco(codigo: string | undefined): Falha {
  if (codigo === "23505") {
    return { status: 409, codigo: "cpf_ativo", mensagem: "Já existe um funcionário ativo com este CPF neste cliente.", campo: "documento" };
  }
  return falhaGenerica;
}

export async function listarFuncionarios(clienteId: string): Promise<{ dados: Funcionario[]; erro: string | null }> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("employees")
      .select(COLUNAS_FUNCIONARIO)
      .eq("client_id", clienteId)
      .order("full_name");
    if (error) return { dados: [], erro: "Não foi possível carregar os funcionários." };
    return { dados: ((data ?? []) as LinhaFuncionario[]).map(paraFuncionario), erro: null };
  } catch {
    return { dados: [], erro: "Não foi possível falar com o banco de dados." };
  }
}

/** Adicionar, e também readmitir: readmissão é um vínculo novo com o mesmo CPF. */
export async function criarFuncionario(
  clienteId: string,
  dados: DadosDoFuncionario,
  autor: string,
): Promise<ResultadoEscrita<{ id: string }>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("employees")
      .insert({ ...deFuncionario(dados), client_id: clienteId, created_by: autor })
      .select("id")
      .single();
    if (error || !data) return { ok: false, falha: falhaDoBanco(error?.code) };
    return { ok: true, dados: { id: (data as { id: string }).id } };
  } catch {
    return { ok: false, falha: falhaGenerica };
  }
}

export async function editarFuncionario(
  clienteId: string,
  id: string,
  dados: DadosDoFuncionario,
): Promise<ResultadoEscrita<{ id: string }>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("employees")
      .update(deFuncionario(dados))
      .eq("id", id)
      .eq("client_id", clienteId)
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, falha: falhaDoBanco(error.code) };
    if (!data) return { ok: false, falha: { status: 404, codigo: "nao_encontrado", mensagem: "Funcionário não encontrado." } };
    return { ok: true, dados: { id } };
  } catch {
    return { ok: false, falha: falhaGenerica };
  }
}

export async function demitirFuncionario(
  clienteId: string,
  id: string,
  saida: string,
  motivo: string | null,
): Promise<ResultadoEscrita<{ id: string }>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("employees")
      .update({ dismissed_at: saida, dismissal_reason: motivo })
      .eq("id", id)
      .eq("client_id", clienteId)
      .is("dismissed_at", null)
      .select("id")
      .maybeSingle();
    if (error?.code === "23514") {
      return { ok: false, falha: { status: 422, codigo: "saida_antes", mensagem: "A saída é antes da admissão.", campo: "saida" } };
    }
    if (error) return { ok: false, falha: falhaGenerica };
    if (!data) {
      return { ok: false, falha: { status: 409, codigo: "ja_demitido", mensagem: "Este funcionário já foi demitido. Atualize a página." } };
    }
    return { ok: true, dados: { id } };
  } catch {
    return { ok: false, falha: falhaGenerica };
  }
}

/**
 * Aplica o plano da importação. Atualizar só escreve o que a planilha trouxe
 * preenchido: célula vazia não apaga o que a MX já tinha.
 */
export async function aplicarImportacao(
  clienteId: string,
  plano: PlanoDeImportacao,
  autor: string,
): Promise<ResultadoEscrita<{ incluidos: number; atualizados: number }>> {
  try {
    const supabase = await clienteServidor();
    const novos = [...plano.novos, ...plano.readmitir].map((i) => ({
      ...deFuncionario(i.dados),
      client_id: clienteId,
      created_by: autor,
    }));
    if (novos.length) {
      const { error } = await supabase.from("employees").insert(novos);
      if (error) return { ok: false, falha: falhaDoBanco(error.code) };
    }

    let atualizados = 0;
    for (const item of plano.atualizar) {
      const mudanca = Object.fromEntries(Object.entries(deFuncionario(item.dados)).filter(([, v]) => v !== null && v !== ""));
      const { error } = await supabase.from("employees").update(mudanca).eq("id", item.existenteId!).eq("client_id", clienteId);
      if (!error) atualizados += 1;
    }
    return { ok: true, dados: { incluidos: novos.length, atualizados } };
  } catch {
    return { ok: false, falha: falhaGenerica };
  }
}

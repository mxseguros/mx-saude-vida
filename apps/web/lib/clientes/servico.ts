import "server-only";

import { clienteServidor } from "../supabase/servidor";
import type { DadosDoCliente } from "../dominio/cliente";
import { deCanal } from "../dominio/mapear";

/**
 * Escrita de clientes.
 *
 * Roda com o cliente da SESSÃO: a RLS decide quem pode. O perfil de leitura
 * recebe zero linhas afetadas, e a rota já o barrou antes com `exigirEscrita`
 * — as duas camadas fazem a mesma pergunta, de propósito.
 */

export type Falha = { status: number; codigo: string; mensagem: string; campo?: string };

export type ResultadoEscrita<T> = { ok: true; dados: T } | { ok: false; falha: Falha };

/**
 * Um cadastro por CNPJ E RAMO (`clients_documento_ramo_idx`).
 *
 * A mesma empresa pode ter VIDA e SAÚDE, cada um com suas datas — é assim no
 * CONTROLE FATURAS. O que a constraint barra é o cadastro repetido de verdade:
 * o mesmo CNPJ no mesmo ramo, que viraria duas linhas no Controle e duas
 * mensagens para o mesmo gestor no mesmo dia.
 */
const DUPLICADO = "23505";

function paraLinha(dados: DadosDoCliente) {
  return {
    legal_name: dados.razaoSocial,
    trade_name: dados.nomeFantasia,
    document: dados.documento,
    insurer_id: dados.seguradoraId,
    product: dados.produto,
    notes: dados.observacoes,
    inform_day: dados.informarDia,
    cutoff_day: dados.corteDia,
    invoice_day: dados.boletoDia,
    due_day: dados.vencimentoDia,
    mx_tracks_payment: dados.acompanhaPagamento,
    channel: deCanal(dados.canal),
    manager_name: dados.gestorNome,
    manager_phone: dados.gestorCelular,
    manager_email: dados.gestorEmail,
  };
}

function interpretar(codigo: string | undefined): Falha {
  if (codigo === DUPLICADO) {
    return {
      status: 409,
      codigo: "documento_duplicado",
      mensagem: "Já existe um cadastro com este CNPJ neste ramo. Para outro ramo da mesma empresa, mude o tipo de seguro.",
      campo: "documento",
    };
  }
  // Zero linhas afetadas pela RLS chega como sucesso sem dado; erro de
  // permissão explícito chega como 42501.
  if (codigo === "42501") {
    return { status: 403, codigo: "sem_permissao", mensagem: "Seu perfil não pode alterar clientes." };
  }
  return { status: 503, codigo: "banco_indisponivel", mensagem: "Não foi possível salvar agora. Tente de novo." };
}

export async function criarCliente(
  dados: DadosDoCliente,
  autor: string,
): Promise<ResultadoEscrita<{ id: string }>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("clients")
      .insert({ ...paraLinha(dados), created_by: autor })
      .select("id")
      .single();

    if (error) return { ok: false, falha: interpretar(error.code) };
    return { ok: true, dados: { id: (data as { id: string }).id } };
  } catch {
    return { ok: false, falha: interpretar(undefined) };
  }
}

export async function editarCliente(id: string, dados: DadosDoCliente): Promise<ResultadoEscrita<{ id: string }>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("clients")
      .update(paraLinha(dados))
      .eq("id", id)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();

    if (error) return { ok: false, falha: interpretar(error.code) };
    // Sem linha: ou o cliente não existe, ou a RLS recusou em silêncio. As
    // duas merecem a mesma resposta — a tela não pode afirmar que salvou.
    if (!data) {
      return {
        ok: false,
        falha: { status: 404, codigo: "nao_encontrado", mensagem: "Este cliente não está mais disponível." },
      };
    }
    return { ok: true, dados: { id: (data as { id: string }).id } };
  } catch {
    return { ok: false, falha: interpretar(undefined) };
  }
}

/**
 * Inativar NÃO apaga: o histórico de movimentações, documentos e boletos fica,
 * e o portal do cliente fecha na hora (a RLS exige `active` e `deleted_at is
 * null`). Excluir de vez é do administrador, e só para cadastro criado por
 * engano.
 */
export async function inativarCliente(
  id: string,
  motivo: string | null,
): Promise<ResultadoEscrita<{ id: string }>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("clients")
      .update({ active: false, deleted_at: new Date().toISOString(), deleted_reason: motivo })
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) return { ok: false, falha: interpretar(error.code) };
    if (!data) {
      return {
        ok: false,
        falha: { status: 404, codigo: "nao_encontrado", mensagem: "Este cliente não está mais disponível." },
      };
    }
    return { ok: true, dados: { id: (data as { id: string }).id } };
  } catch {
    return { ok: false, falha: interpretar(undefined) };
  }
}

export async function reativarCliente(id: string): Promise<ResultadoEscrita<{ id: string }>> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("clients")
      .update({ active: true, deleted_at: null, deleted_reason: null })
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) return { ok: false, falha: interpretar(error.code) };
    if (!data) {
      return {
        ok: false,
        falha: { status: 404, codigo: "nao_encontrado", mensagem: "Este cliente não está mais disponível." },
      };
    }
    return { ok: true, dados: { id: (data as { id: string }).id } };
  } catch {
    return { ok: false, falha: interpretar(undefined) };
  }
}

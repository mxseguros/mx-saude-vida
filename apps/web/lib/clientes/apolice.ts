import "server-only";

import { enviarArquivo } from "../arquivos/servico";
import { capitalDoCadastro, type ApoliceValidada } from "../dominio/apolice";
import { marcarAceite } from "../ia/registro";
import { clienteServidor } from "../supabase/servidor";
import type { ResultadoEscrita } from "./servico";

/**
 * Grava a apólice que a analista conferiu. A IA nunca salva: chega aqui só o
 * que passou pela tela.
 *
 * Uma apólice ativa por cliente: existindo, é atualizada (renovação troca
 * número e vigência, não cria um segundo contrato vigente).
 */
export async function salvarApolice(
  clienteId: string,
  dados: ApoliceValidada,
  arquivo: File | null,
  perfilId: string,
): Promise<ResultadoEscrita<{ id: string }>> {
  try {
    let pdfId: string | null = null;
    if (arquivo) {
      const enviado = await enviarArquivo(
        { clienteId, controleId: null, competencia: null, tipo: "apolice", arquivo },
        { perfilId },
      );
      if (!enviado.ok) return enviado;
      pdfId = enviado.dados.id;
    }

    const supabase = await clienteServidor();
    const ficha: Record<string, unknown> = {
      policy_number: dados.numero,
      contract_number: dados.contrato,
      product_name: dados.produto,
      valid_from: dados.vigenciaInicio,
      valid_to: dados.vigenciaFim,
      capital_rule: capitalDoCadastro(dados),
      rate_per_mille: dados.taxaPorMil,
      age_limit: dados.limiteDeIdade,
    };
    if (pdfId) ficha.pdf_file_id = pdfId;
    if (dados.execucaoId) ficha.extracted_by_ai_run = dados.execucaoId;

    const atual = await lerApoliceAtiva(clienteId);
    const { data, error } = atual
      ? await supabase.from("policies").update(ficha).eq("id", atual.id).select("id").single()
      : await supabase.from("policies").insert({ ...ficha, client_id: clienteId }).select("id").single();

    if (error || !data) {
      return {
        ok: false,
        falha: { status: 503, codigo: "apolice_nao_salva", mensagem: "Não foi possível salvar a apólice." },
      };
    }

    if (dados.execucaoId) await marcarAceite(dados.execucaoId, true);
    return { ok: true, dados: { id: (data as { id: string }).id } };
  } catch {
    return { ok: false, falha: { status: 503, codigo: "sem_banco", mensagem: "Não foi possível falar com o servidor." } };
  }
}

export type ApoliceDoCliente = {
  id: string;
  numero: string;
  contrato: string | null;
  produto: string | null;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  capital: unknown;
  taxaPorMil: number | null;
  limiteDeIdade: number | null;
  pdfArquivoId: string | null;
  pdfNome: string | null;
  lidaPeloAgente: boolean;
};

/** A apólice ativa mais recente do cliente, ou `null`. */
export async function lerApoliceAtiva(clienteId: string): Promise<ApoliceDoCliente | null> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("policies")
      .select(
        "id, policy_number, contract_number, product_name, valid_from, valid_to, capital_rule, rate_per_mille, age_limit, pdf_file_id, extracted_by_ai_run, client_files:pdf_file_id(original_name)",
      )
      .eq("client_id", clienteId)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    const l = data as unknown as {
      id: string;
      policy_number: string;
      contract_number: string | null;
      product_name: string | null;
      valid_from: string | null;
      valid_to: string | null;
      capital_rule: unknown;
      rate_per_mille: string | number | null;
      age_limit: number | null;
      pdf_file_id: string | null;
      extracted_by_ai_run: number | null;
      client_files: { original_name: string } | { original_name: string }[] | null;
    };
    const arquivo = Array.isArray(l.client_files) ? l.client_files[0] : l.client_files;
    return {
      id: l.id,
      numero: l.policy_number,
      contrato: l.contract_number,
      produto: l.product_name,
      vigenciaInicio: l.valid_from,
      vigenciaFim: l.valid_to,
      capital: l.capital_rule,
      taxaPorMil: l.rate_per_mille === null ? null : Number(l.rate_per_mille),
      limiteDeIdade: l.age_limit,
      pdfArquivoId: l.pdf_file_id,
      pdfNome: arquivo?.original_name ?? null,
      lidaPeloAgente: l.extracted_by_ai_run !== null,
    };
  } catch {
    return null;
  }
}

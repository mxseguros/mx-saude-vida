import "server-only";

import { clienteServidor } from "../supabase/servidor";

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

import "server-only";

import { nomeCurto } from "../dominio/cliente";
import { competenciaDe, type ModeloDeMensagem } from "../dominio/controle";
import { paraModelo } from "../dominio/mapear";
import { clienteServidor } from "../supabase/servidor";

/** Uma mensagem pronta na fila, esperando a analista abrir no Outlook ou no WhatsApp. */
export type MensagemPendente = {
  id: number;
  controleId: string;
  cliente: string;
  competencia: string;
  modelo: ModeloDeMensagem;
  canal: "email" | "whatsapp";
  destino: string;
  assunto: string | null;
  corpo: string;
  preparadaEm: string;
  /** O PDF do boleto, para baixar junto quando a mensagem é de boleto. */
  boletoArquivoId: string | null;
};

export async function listarPendentes(): Promise<{ dados: MensagemPendente[]; erro: string | null }> {
  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("messages")
      .select(
        "id, control_id, kind, channel, to_address, subject, body, created_at, monthly_controls!inner(competence, invoice_file_id, clients!inner(legal_name, trade_name, deleted_at))",
      )
      .eq("status", "pending")
      .is("monthly_controls.clients.deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) return { dados: [], erro: "Não foi possível carregar as mensagens para enviar." };

    type Linha = {
      id: number;
      control_id: string;
      kind: string;
      channel: string;
      to_address: string;
      subject: string | null;
      body: string;
      created_at: string;
      monthly_controls: {
        competence: string;
        invoice_file_id: string | null;
        clients: { legal_name: string; trade_name: string | null };
      };
    };

    return {
      dados: ((data ?? []) as unknown as Linha[]).map((l) => ({
        id: l.id,
        controleId: l.control_id,
        cliente: nomeCurto({
          razaoSocial: l.monthly_controls.clients.legal_name,
          nomeFantasia: l.monthly_controls.clients.trade_name,
        }),
        competencia: competenciaDe(l.monthly_controls.competence),
        modelo: paraModelo(l.kind),
        canal: l.channel === "email" ? "email" : "whatsapp",
        destino: l.to_address,
        assunto: l.subject,
        corpo: l.body,
        preparadaEm: l.created_at,
        boletoArquivoId: l.kind === "invoice" ? l.monthly_controls.invoice_file_id : null,
      })),
      erro: null,
    };
  } catch {
    return { dados: [], erro: "Não foi possível falar com o banco de dados." };
  }
}

/** Só a contagem, para o sino do menu: consulta leve, roda em toda página. */
export async function contarPendentes(): Promise<number | null> {
  try {
    const supabase = await clienteServidor();
    const { count, error } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    return error ? null : (count ?? 0);
  } catch {
    return null;
  }
}

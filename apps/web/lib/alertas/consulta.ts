import "server-only";

import { montarAlertas, type Alerta, type MesParaAlerta } from "../dominio/alerta";
import { nomeCurto } from "../dominio/cliente";
import { competenciaDe } from "../dominio/controle";
import { hojeSaoPaulo } from "../dominio/hoje";
import { paraPasso } from "../dominio/mapear";
import { clienteServidor } from "../supabase/servidor";
import { primeiroDia } from "../controles/consulta";

/**
 * Os alertas de agora: mês anterior e atual. O vencimento de setembro cai em
 * outubro, então olhar só a competência corrente esconderia o atrasado.
 *
 * Consulta enxuta (só as colunas da conta), porque o sino roda em toda página.
 */
export async function lerAlertas(hoje: string = hojeSaoPaulo()): Promise<{ dados: Alerta[]; erro: string | null }> {
  const atual = hoje.slice(0, 7);
  const [ano, mes] = atual.split("-").map(Number) as [number, number];
  const anterior = mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, "0")}`;

  try {
    const supabase = await clienteServidor();
    const { data, error } = await supabase
      .from("v_control_board")
      .select(
        "id, competence, step, inform_date, cutoff_date, invoice_date, due_date, legal_name, trade_name, insurer_name, analyst_name, resent_after_check, confirm_date, issue_confirmed_at",
      )
      .in("competence", [primeiroDia(anterior), primeiroDia(atual)]);

    if (error) return { dados: [], erro: "Não foi possível carregar os alertas." };

    const meses = (data ?? []).map(
      (v): MesParaAlerta => ({
        id: v.id as string,
        competencia: competenciaDe(v.competence as string),
        cliente: nomeCurto({ razaoSocial: v.legal_name as string, nomeFantasia: v.trade_name as string | null }),
        seguradora: v.insurer_name as string | null,
        analista: v.analyst_name as string | null,
        passo: paraPasso(v.step as string),
        datas: {
          informar: v.inform_date as string | null,
          corte: v.cutoff_date as string | null,
          ...(v.confirm_date ? { confirmar: v.confirm_date as string } : {}),
          boleto: v.invoice_date as string,
          vencimento: v.due_date as string,
        },
        reenviou: v.resent_after_check === true,
        emissaoConfirmada: v.issue_confirmed_at !== null,
      }),
    );
    return { dados: montarAlertas(meses, hoje), erro: null };
  } catch {
    return { dados: [], erro: "Não foi possível falar com o banco de dados." };
  }
}

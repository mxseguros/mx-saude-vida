/**
 * Alertas de prazo (protótipo v0.7, tAlertas): as atividades do mês agrupadas
 * por urgência. Puro, "hoje" por parâmetro.
 *
 * Derivados, nunca guardados: registrada a ação, o mês anda de passo e o
 * alerta some sozinho.
 */

import { atividadesDoMes, type Atividade, type MesParaAgenda, type TipoDeAtividade } from "./atividade";

export type GrupoDeAlerta = "atrasado" | "hoje" | "perto" | "validar";

export const ROTULO_GRUPO: Record<GrupoDeAlerta, string> = {
  atrasado: "Atrasados",
  hoje: "Hoje",
  perto: "Próximos 3 dias",
  validar: "Para validar",
};

export type Alerta = {
  grupo: GrupoDeAlerta;
  controleId: string;
  titulo: string;
  detalhe: string;
  /** `confirmar`: o botão grava na hora, sem trocar de tela. */
  acao: { rotulo: string; href: string; confirmar?: string };
  /** Para ordenar: o dia do prazo, ou vazio no grupo "para validar". */
  dia: string;
};

export type MesParaAlerta = MesParaAgenda & {
  competencia: string;
  /** O gestor reenviou depois da conferência (decisão de 05/10). */
  reenviou: boolean;
};

const NOME: Record<TipoDeAtividade, string> = {
  informar: "Compartilhar o link",
  corte: "Corte",
  confirmar: "Confirmar emissão",
  boleto: "Gerar o boleto",
  vencimento: "Vencimento do boleto",
};

/** Só corte e vencimento avisam antes, como no protótipo: são os que custam dinheiro. */
const AVISA_ANTES: readonly TipoDeAtividade[] = ["corte", "vencimento"];

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);
}

/** O botão que resolve, levando à tela certa. */
function acaoDe(a: Atividade, competencia: string): Alerta["acao"] {
  if (a.tipo === "confirmar") return { rotulo: "Confirmar", href: `/controle?mes=${competencia}`, confirmar: a.controleId };
  if (a.passo === "planilha_recebida") return { rotulo: "Conferir", href: `/controle/${a.controleId}/conferir` };
  if (a.tipo === "informar" || (a.tipo === "corte" && a.passo === "informar")) {
    return { rotulo: "Enviar link", href: `/controle/${a.controleId}/coleta` };
  }
  const rotulo = a.tipo === "vencimento" ? "Marcar pago" : a.tipo === "boleto" ? "Anexar boleto" : "Abrir";
  return { rotulo, href: `/controle?mes=${competencia}` };
}

export function montarAlertas(meses: readonly MesParaAlerta[], hoje: string): Alerta[] {
  const alertas: Alerta[] = [];

  for (const mes of meses) {
    for (const a of atividadesDoMes(mes, hoje)) {
      if (a.estado === "feita") continue;
      // Conferido, o corte é do sistema: o cron avança o passo na data.
      if (a.tipo === "corte" && a.passo === "conferida") continue;
      const falta = diasEntre(hoje, a.dia);
      const grupo: GrupoDeAlerta | null =
        a.estado === "atrasada"
          ? "atrasado"
          : falta === 0
            ? "hoje"
            : falta > 0 && falta <= 3 && AVISA_ANTES.includes(a.tipo)
              ? "perto"
              : null;
      if (!grupo) continue;

      const quando = grupo === "atrasado" ? `era ${ddmm(a.dia)}` : grupo === "perto" ? ddmm(a.dia) : "hoje";
      alertas.push({
        grupo,
        controleId: a.controleId,
        titulo:
          grupo === "atrasado"
            ? `${NOME[a.tipo]} atrasado · ${a.cliente}`
            : grupo === "hoje"
              ? `${NOME[a.tipo]} hoje · ${a.cliente}`
              : `${NOME[a.tipo]} em ${falta} dia${falta > 1 ? "s" : ""} · ${a.cliente}`,
        detalhe: [quando, a.seguradora].filter(Boolean).join(" · "),
        acao: acaoDe(a, mes.competencia),
        dia: a.dia,
      });
    }

    if (mes.passo === "planilha_recebida" || mes.reenviou) {
      alertas.push({
        grupo: "validar",
        controleId: mes.id,
        titulo: mes.reenviou
          ? `Gestor reenviou depois da conferência · ${mes.cliente}`
          : `Movimentação recebida · ${mes.cliente}`,
        detalhe: [mes.reenviou ? "confira de novo antes do boleto" : "aguardando conferência", mes.seguradora]
          .filter(Boolean)
          .join(" · "),
        acao: { rotulo: "Conferir", href: `/controle/${mes.id}/conferir` },
        dia: "",
      });
    }
  }

  const ordem: GrupoDeAlerta[] = ["atrasado", "hoje", "perto", "validar"];
  return alertas.sort(
    (x, y) => ordem.indexOf(x.grupo) - ordem.indexOf(y.grupo) || x.dia.localeCompare(y.dia) || x.titulo.localeCompare(y.titulo, "pt-BR"),
  );
}

/** O número do sino: atrasados e os de hoje. `atrasados` pinta a medalha de vermelho. */
export function contarUrgentes(alertas: readonly Alerta[]): { urgentes: number; atrasados: number } {
  const atrasados = alertas.filter((a) => a.grupo === "atrasado").length;
  return { urgentes: atrasados + alertas.filter((a) => a.grupo === "hoje").length, atrasados };
}

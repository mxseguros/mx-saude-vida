import { nomeDoMes, podeAgir, situacaoDoPrazo, type DatasDoMes, type Passo } from "./controle";

/**
 * O mês visto pelo CLIENTE.
 *
 * O gestor do cliente não conhece "corte", "conferida" nem "competência" — e
 * não deveria. A tela dele responde uma pergunta só: **preciso fazer algo
 * agora?** Este módulo traduz o passo interno nessa resposta.
 *
 * Mora separado de `controle.ts` de propósito. Lá o vocabulário é da operação
 * da MX, e misturar os dois acabaria com a palavra "corte" aparecendo no
 * celular de quem não tem como saber o que ela significa.
 *
 * Puro e com "hoje" por parâmetro, como o resto do domínio.
 */

/** O que o cliente faz, se faz algo. */
export type TipoDePendencia = "enviar_planilha" | "pagar_boleto" | "aguardando_mx" | "nada";

export type Pendencia = {
  tipo: TipoDePendencia;
  /** O título do cartão, em voz ativa quando há ação. */
  titulo: string;
  /** A linha de apoio: prazo, ou o que a MX está fazendo. */
  detalhe: string;
  /** A data que importa agora, em ISO, ou `null`. */
  prazo: string | null;
  /** `true` quando o prazo venceu ou vence hoje: o cartão ganha a cor de alerta. */
  urgente: boolean;
};

/**
 * A pendência do mês.
 *
 * Três das sete etapas são de espera, e nelas o cartão diz o que a MX está
 * fazendo em vez de ficar em branco: silêncio na tela faz o gestor ligar para
 * perguntar se a planilha chegou.
 */
export function pendenciaDoCliente(
  passo: Passo,
  datas: DatasDoMes,
  competencia: string,
  hoje: string,
): Pendencia {
  const mes = nomeDoMes(competencia);

  if (passo === "informar") {
    const prazo = datas.informar;
    const situacao = prazo ? situacaoDoPrazo(prazo, hoje) : null;
    const urgente = situacao === "vencido" || situacao === "hoje";

    return {
      tipo: "enviar_planilha",
      titulo: `Enviar a planilha de ${mes}`,
      detalhe: urgente
        ? situacao === "hoje"
          ? "O prazo é hoje. Leva 2 minutos — e se não houve mudanças, é só marcar."
          : "O prazo passou. Envie assim que puder, ou marque que não houve mudanças."
        : "Leva 2 minutos. Se não houve mudanças no mês, é só marcar.",
      prazo,
      urgente,
    };
  }

  if (passo === "planilha_recebida") {
    return {
      tipo: "aguardando_mx",
      titulo: `Planilha de ${mes} recebida`,
      detalhe: "A MX está conferindo. Se faltar algo, a gente chama você.",
      prazo: null,
      urgente: false,
    };
  }

  if (passo === "conferida" || passo === "corte") {
    return {
      tipo: "aguardando_mx",
      titulo: `Movimentação de ${mes} em andamento`,
      detalhe: "A MX já conferiu e está tratando com a seguradora. Você não precisa fazer nada.",
      prazo: datas.boleto,
      urgente: false,
    };
  }

  if (passo === "boleto" || passo === "vencimento") {
    const situacao = situacaoDoPrazo(datas.vencimento, hoje);
    const urgente = situacao === "vencido" || situacao === "hoje";

    return {
      tipo: "pagar_boleto",
      titulo: `Boleto de ${mes} disponível`,
      detalhe: urgente
        ? situacao === "hoje"
          ? "Vence hoje. Ele está em Meus documentos."
          : "O vencimento passou. Fale com a MX antes de pagar, para conferir o valor."
        : "Está em Meus documentos, e também foi enviado a você.",
      prazo: datas.vencimento,
      urgente,
    };
  }

  return {
    tipo: "nada",
    titulo: `${mes.charAt(0).toUpperCase()}${mes.slice(1)} está concluído`,
    detalhe: "Nada pendente. O próximo mês abre automaticamente.",
    prazo: null,
    urgente: false,
  };
}

/**
 * O cliente pode enviar planilha agora?
 *
 * Pergunta à máquina de passos, e não a uma lista própria: a autorização de
 * verdade é a mesma que a rota aplica (`podeAgir`), e duas listas divergiriam
 * no primeiro passo novo. A tela usa isto para explicar, antes do clique, por
 * que o botão não está lá.
 */
export function podeEnviarPlanilha(passo: Passo): boolean {
  return podeAgir(passo, "receber_planilha") || podeAgir(passo, "sem_movimentacao");
}

/**
 * O que acontece depois do envio, para a tela de sucesso.
 *
 * Existe para a pessoa guardar o celular sabendo o que vem. Sem isto, a tela
 * de "enviado" é um beco: a dúvida "e agora?" vira ligação para a analista.
 */
export type Marco = { quando: string; o_que: string };

export function marcosDepoisDoEnvio(datas: DatasDoMes, competencia: string): Marco[] {
  const mes = nomeDoMes(competencia);
  const marcos: Marco[] = [
    { quando: "Agora", o_que: `A planilha de ${mes} entrou para conferência da MX.` },
    { quando: "Até 1 dia útil", o_que: "A MX confere e, se precisar de algo, chama você." },
  ];

  if (datas.corte) {
    marcos.push({ quando: dia(datas.corte), o_que: "Movimentação enviada à seguradora." });
  }

  marcos.push({ quando: dia(datas.boleto), o_que: "O boleto aparece em Meus documentos e chega a você." });
  marcos.push({ quando: dia(datas.vencimento), o_que: "Vencimento do boleto." });

  return marcos;
}

/** `2026-10-08` → `08/10`. */
function dia(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

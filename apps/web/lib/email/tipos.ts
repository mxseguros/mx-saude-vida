/**
 * O contrato do envio, independente do provedor. Puro: só tipos.
 */

export type ResultadoEmail =
  | { ok: true; id: string }
  | {
      ok: false;
      /**
       * `sem_provedor` é diferente de `recusado`: o primeiro é configuração
       * que falta (e a tela pede para avisar o administrador), o segundo é o
       * provedor dizendo não a este e-mail específico. `rede` é tempo ou
       * conexão — tentar de novo costuma bastar.
       */
      codigo: "sem_provedor" | "recusado" | "rede";
      mensagem: string;
    };

export type Mensagem = {
  para: string[];
  assunto: string;
  html: string;
  texto: string;
  /** Para quem o segurado responde. Sem isto a resposta some no remetente. */
  responderPara?: string;
};

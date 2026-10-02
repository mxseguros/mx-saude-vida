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

/**
 * Um anexo. `conteudo` em base64, que e o formato que os dois provedores pedem.
 *
 * Existe para o boleto: "seu boleto esta disponivel" com o PDF junto poupa o
 * cliente de entrar no portal para baixar um arquivo de 20 KB.
 */
export type Anexo = {
  nome: string;
  tipo: string;
  /** base64, sem o prefixo `data:`. */
  conteudo: string;
};

/**
 * Teto do anexo.
 *
 * O Graph aceita 3 MB no `sendMail` simples e acima disso exige sessao de
 * upload; o corpo de uma funcao da Vercel para em 4,5 MB. Boleto tem 20 KB, e o
 * teto existe para o caso de alguem anexar a apolice escaneada por engano.
 */
export const ANEXO_MAXIMO = 3 * 1024 * 1024;

export type Mensagem = {
  para: string[];
  assunto: string;
  html: string;
  texto: string;
  /** Para quem o segurado responde. Sem isto a resposta some no remetente. */
  responderPara?: string;
  anexos?: Anexo[];
};

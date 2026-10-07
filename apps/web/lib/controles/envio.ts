import "server-only";

import { lerControle, listarModelos } from "./consulta";
import { prepararMensagem } from "./servico";
import { canaisPossiveis, montarEmailDaMensagem } from "../dominio/mensagem";
import { nomeCurto } from "../dominio/cliente";
import { urlBase } from "../ambiente";
import { lerTokenDoMes } from "./coleta";
import type { ModeloDeMensagem } from "../dominio/controle";

/**
 * Enviar a mensagem de um passo SEM a analista digitar nada.
 *
 * Existe para o boleto: ao anexar o PDF, o cliente é avisado na hora, com o
 * documento junto. A janela de "Anexar boleto" promete "salvar e avisar o
 * cliente", e promessa de tela que o código não cumpre é defeito.
 *
 * Diferente da rota `/mensagem`, onde a analista EDITA o texto antes de enviar:
 * aqui o texto é o do modelo salvo, sem passar por ninguém.
 *
 * **Nunca lança e nunca falha a operação que a chamou.** Anexar o boleto deu
 * certo; se o e-mail não sair, o resultado diz isso e a analista reenvia pelo
 * botão da linha. Desfazer o anexo por causa do e-mail seria perder o trabalho
 * certo por causa do que depende de terceiro.
 */

export type ResultadoDoEnvio = {
  /** Um e-mail ficou pronto na fila, para a analista abrir no Outlook. */
  email: boolean;
  /** Um WhatsApp ficou pronto na fila, para a analista abrir. */
  whatsapp: boolean;
  /** Em português, o que contar à analista. `null` quando tudo saiu. */
  aviso: string | null;
};

export async function enviarMensagemDoPasso(
  controleId: string,
  modelo: ModeloDeMensagem,
): Promise<ResultadoDoEnvio> {
  const nada: ResultadoDoEnvio = { email: false, whatsapp: false, aviso: null };

  try {
    const [controle, modelos] = await Promise.all([lerControle(controleId), listarModelos()]);
    if (!controle.dados) return { ...nada, aviso: "Não consegui avisar o cliente: movimentação não encontrada." };

    const linha = controle.dados;
    const salvo = modelos.dados.find((m) => m.modelo === modelo);
    if (!salvo) {
      return { ...nada, aviso: "O modelo desta mensagem não está cadastrado. Configurações › Mensagens." };
    }

    const cliente = nomeCurto({ razaoSocial: linha.razaoSocial, nomeFantasia: linha.nomeFantasia });
    const canais = canaisPossiveis(linha.canal, {
      celular: linha.gestorCelular,
      email: linha.gestorEmail,
    });

    if (!canais.email && !canais.whatsapp) {
      return { ...nada, aviso: `${cliente} não tem e-mail nem celular do gestor no cadastro. Ninguém foi avisado.` };
    }

    const token =
      modelo === "informar" || modelo === "correcao" ? await lerTokenDoMes(controleId) : null;

    const conteudo = montarEmailDaMensagem(salvo, {
      cliente,
      gestor: linha.gestorNome,
      competencia: linha.competencia,
      data: linha.vencimentoDoBoleto ?? linha.datas.vencimento,
      dataCorte: linha.datas.corte,
      dataBoleto: linha.datas.boleto,
      dataVencimento: linha.datas.vencimento,
      valorDoBoleto: linha.valorDoBoleto,
      // Só as mensagens que pedem movimentação levam link; as outras não têm
            // para onde mandar. Ver a nota em `cron.ts`.
      link: token ? `${urlBase()}/coleta/${token}` : "",
      seguradora: linha.seguradora,
      analista: linha.analista,
    });

    // Nada sai daqui (decisão de 07/10): a mensagem fica PRONTA na fila
    // "Mensagens para enviar", e a analista abre no Outlook ou no WhatsApp.
    let email = false;
    let whatsapp = false;
    if (canais.email && linha.gestorEmail) {
      email = (await prepararMensagem(controleId, modelo, "email", linha.gestorEmail, conteudo.assunto, conteudo.texto)).ok;
    }
    if (canais.whatsapp && linha.gestorCelular) {
      whatsapp = (await prepararMensagem(controleId, modelo, "whatsapp", linha.gestorCelular, null, conteudo.texto)).ok;
    }

    const aviso =
      email || whatsapp
        ? "Boleto anexado. Avise o cliente em Alertas › Mensagens para enviar, ou pelo botão Enviar mensagem da linha."
        : "Boleto anexado, mas não consegui preparar a mensagem. Avise pelo botão Enviar mensagem da linha.";

    return { email, whatsapp, aviso };
  } catch {
    return { ...nada, aviso: "O boleto foi salvo, mas não consegui avisar o cliente. Reenvie pelo botão da linha." };
  }
}

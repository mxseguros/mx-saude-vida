import { erroJson, exigirEscrita, lerCorpo } from "@/lib/api";
import { lerControle, listarModelos } from "@/lib/controles/consulta";
import { registrarMensagem } from "@/lib/controles/servico";
import { mensagemDoPasso } from "@/lib/dominio/controle";
import { canaisPossiveis, montarMensagem } from "@/lib/dominio/mensagem";
import { enviarEmail } from "@/lib/email/enviar";
import { ROTULO_MODELO } from "@/lib/dominio/mensagem";
import { montarNotificacao } from "@/lib/dominio/email";
import { nomeCurto } from "@/lib/dominio/cliente";

/**
 * POST /api/v1/controles/[id]/mensagem  { canal, texto }
 *
 * O MODELO não vem do cliente: ele é derivado do passo atual, aqui no
 * servidor. Aceitar o modelo do corpo deixaria a tela mandar aviso de
 * vencimento a quem ainda não tem boleto.
 *
 * No WhatsApp a rota só REGISTRA: quem abre a conversa é o navegador da
 * analista. No e-mail a rota envia de verdade.
 */
export async function POST(request: Request, contexto: { params: Promise<{ id: string }> }) {
  const sessao = await exigirEscrita();
  if (!sessao.ok) return sessao.resposta;

  const { id } = await contexto.params;
  const corpo = (await lerCorpo(request)) as { canal?: unknown; texto?: unknown } | null;

  const canal = corpo?.canal === "email" || corpo?.canal === "whatsapp" ? corpo.canal : null;
  const texto = typeof corpo?.texto === "string" ? corpo.texto.trim() : "";

  if (!canal) return erroJson(400, "canal_invalido", "Escolha WhatsApp ou e-mail.", "canal");
  if (!texto) return erroJson(400, "texto_vazio", "A mensagem não pode ir em branco.", "texto");

  const controle = await lerControle(id);
  if (controle.erro) return erroJson(503, "consulta_indisponivel", controle.erro);
  if (!controle.dados) return erroJson(404, "nao_encontrado", "Esta movimentação não existe.");

  const linha = controle.dados;
  const modelo = mensagemDoPasso(linha.passo);
  if (!modelo) {
    return erroJson(
      409,
      "passo_sem_mensagem",
      "Esta etapa não tem mensagem para o cliente. Atualize a página para ver como ela está.",
    );
  }

  // O canal precisa estar habilitado NO CADASTRO e ter destino. Sem isto, um
  // POST direto mandaria e-mail a quem pediu só WhatsApp.
  const possiveis = canaisPossiveis(linha.canal, { celular: linha.gestorCelular, email: linha.gestorEmail });
  if (!possiveis[canal]) {
    return erroJson(
      422,
      "canal_indisponivel",
      `Este cliente não recebe por ${canal === "email" ? "e-mail" : "WhatsApp"}. Confira o cadastro.`,
      "canal",
    );
  }

  const destino = (canal === "email" ? linha.gestorEmail : linha.gestorCelular) as string;
  let falhou: string | null = null;

  if (canal === "email") {
    const cliente = nomeCurto({ razaoSocial: linha.razaoSocial, nomeFantasia: linha.nomeFantasia });

    // O ASSUNTO vem do modelo salvo, e não do corpo da requisição: a analista
    // edita o texto na janela, não o assunto, e deixar o cliente escolhê-lo
    // seria uma porta para mandar qualquer coisa em nome da MX.
    const modelos = await listarModelos();
    const salvo = modelos.dados.find((m) => m.modelo === modelo);

    const assunto = salvo
      ? montarMensagem(salvo.assunto, {
          cliente,
          gestor: linha.gestorNome,
          competencia: linha.competencia,
          data: linha.datas.informar,
          dataCorte: linha.datas.corte,
          dataBoleto: linha.datas.boleto,
          dataVencimento: linha.datas.vencimento,
          valorDoBoleto: linha.valorDoBoleto,
          link: "",
          seguradora: linha.seguradora,
          analista: linha.analista,
        })
      : `${ROTULO_MODELO[modelo]} · ${cliente}`;

    // O corpo já vem renderizado da janela da analista: `montarNotificacao`
    // aqui só embrulha no HTML com o cabeçalho da corretora — o mesmo que o
    // cron manda, para o cliente não receber dois formatos.
    const email = montarNotificacao({ assunto, corpo: texto }, {});

    const envio = await enviarEmail({
      para: [destino],
      assunto: email.assunto,
      texto: email.texto,
      html: email.html,
    });

    // `sem_provedor` não é erro de quem clicou: é configuração que falta, e a
    // mensagem precisa dizer isso em vez de "tente de novo".
    if (!envio.ok) {
      falhou = envio.codigo;
      await registrarMensagem(id, modelo, canal, destino, texto, sessao.perfil.id, falhou);
      return erroJson(
        503,
        "email_nao_enviado",
        envio.codigo === "sem_provedor"
          ? "O envio de e-mail ainda não está configurado. Use o WhatsApp ou avise o administrador."
          : envio.mensagem,
      );
    }
  }

  const resultado = await registrarMensagem(id, modelo, canal, destino, texto, sessao.perfil.id);
  if (!resultado.ok) {
    const { status, codigo, mensagem } = resultado.falha;
    return erroJson(status, codigo, mensagem);
  }

  return Response.json({ data: { id: resultado.dados.id, canal, destino } }, { status: 201 });
}

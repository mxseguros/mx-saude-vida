import { erroJson, exigirEscrita, lerCorpo } from "@/lib/api";
import { lerControle, listarModelos } from "@/lib/controles/consulta";
import { registrarMensagem } from "@/lib/controles/servico";
import { nomeCurto } from "@/lib/dominio/cliente";
import { mensagemDoPasso } from "@/lib/dominio/controle";
import { canaisPossiveis, montarMensagem, ROTULO_MODELO } from "@/lib/dominio/mensagem";

/**
 * POST /api/v1/controles/[id]/mensagem — REGISTRA a mensagem que a analista
 * acabou de abrir no WhatsApp (`wa.me`) ou no Outlook (`mailto:`).
 *
 * Nada sai daqui: quem envia é a analista, no programa dela (decisão de
 * 07/10). O registro é o que alimenta "Última mensagem" e a linha do tempo, e
 * conclui a pendente do mesmo tipo que a rotina tinha deixado na fila.
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

  // O canal precisa estar habilitado NO CADASTRO e ter destino.
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

  // O assunto registrado vem do modelo salvo, igual ao que a janela montou.
  let assunto: string | null = null;
  if (canal === "email") {
    const cliente = nomeCurto({ razaoSocial: linha.razaoSocial, nomeFantasia: linha.nomeFantasia });
    const salvo = (await listarModelos()).dados.find((m) => m.modelo === modelo);
    assunto = salvo
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
  }

  const resultado = await registrarMensagem(id, modelo, canal, destino, texto, sessao.perfil.id, null, undefined, assunto);
  if (!resultado.ok) {
    const { status, codigo, mensagem } = resultado.falha;
    return erroJson(status, codigo, mensagem);
  }

  return Response.json({ data: { id: resultado.dados.id, canal, destino } }, { status: 201 });
}

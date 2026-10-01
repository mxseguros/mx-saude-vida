import { erroJson, lerCorpo } from "@/lib/api";
import { exigirCliente } from "@/lib/portal/sessao";
import { arquivoPertenceAoCliente, receberPlanilhaDoPortal } from "@/lib/portal/servico";

/**
 * POST /api/portal/envio  { controle, arquivo?, observacao?, semMudancas? }
 *
 * O envio de verdade: é aqui que o mês avança e a analista passa a ver a linha
 * como "aguardando conferência".
 *
 * Duas conferências antes de escrever, porque o serviço usa a chave de
 * administração e ela ignora a RLS: o mês tem de ser do cliente da sessão (o
 * serviço confere), e o ARQUIVO também (conferido aqui). Sem a segunda, um id de
 * arquivo trocado no corpo faria o mês de uma empresa apontar para a planilha de
 * outra — e a analista abriria o arquivo errado para conferir.
 */
export const runtime = "nodejs";

const LIMITE_DA_OBSERVACAO = 500;

export async function POST(request: Request) {
  const sessao = await exigirCliente();
  if (!sessao.ok) return sessao.resposta;

  const corpo = await lerCorpo(request);
  if (!corpo || typeof corpo !== "object") {
    return erroJson(400, "corpo_invalido", "Envio malformado.");
  }

  const { controle, arquivo, observacao, semMudancas } = corpo as Record<string, unknown>;

  if (typeof controle !== "string" || !controle) {
    return erroJson(400, "sem_controle", "Não sei a qual mês este envio pertence.");
  }

  const sem = semMudancas === true;
  const arquivoId = typeof arquivo === "string" && arquivo ? arquivo : null;

  // Uma coisa ou a outra. "Sem mudanças" com arquivo anexado é contraditório, e
  // adivinhar qual das duas vale produziria um mês que ninguém sabe explicar.
  if (sem && arquivoId) {
    return erroJson(
      422,
      "envio_ambiguo",
      'Você marcou "não houve mudanças" e também anexou uma planilha. Escolha uma das duas.',
    );
  }
  if (!sem && !arquivoId) {
    return erroJson(
      422,
      "sem_planilha",
      'Anexe a planilha do mês, ou marque que não houve mudanças.',
      "arquivo",
    );
  }

  let nota: string | null = null;
  if (typeof observacao === "string" && observacao.trim()) {
    nota = observacao.trim().slice(0, LIMITE_DA_OBSERVACAO);
  }

  if (arquivoId && !(await arquivoPertenceAoCliente(arquivoId, sessao.cliente.clienteId))) {
    return erroJson(422, "arquivo_invalido", "Não encontrei a planilha enviada. Anexe o arquivo de novo.", "arquivo");
  }

  const resultado = await receberPlanilhaDoPortal({
    controleId: controle,
    clienteId: sessao.cliente.clienteId,
    clienteUsuarioId: sessao.cliente.id,
    arquivoId,
    observacao: nota,
    semMudancas: sem,
  });

  if (!resultado.ok) {
    const { status, codigo, mensagem } = resultado.falha;
    return erroJson(status, codigo, mensagem);
  }

  return Response.json({ data: resultado.dados }, { status: 201 });
}

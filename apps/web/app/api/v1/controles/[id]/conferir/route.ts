import { erroJson, exigirEscrita, lerCorpo } from "@/lib/api";
import { lerControle } from "@/lib/controles/consulta";
import { aplicarAcaoNoControle } from "@/lib/controles/servico";
import { podeAgir } from "@/lib/dominio/controle";

/**
 * POST /api/v1/controles/[id]/conferir  { acao: "conferir" | "pedir_correcao", observacao?, motivo? }
 *
 * As duas saídas da conferência, numa rota só: a planilha serve, ou volta.
 *
 * Juntas de propósito — são a mesma decisão vista de dois lados, e separá-las
 * em duas rotas duplicaria a conferência de passo e a leitura do mês.
 *
 * "Pedir correção" devolve o mês para `informar` e LIMPA a planilha recusada:
 * o que vale é a próxima. Sem isso, a tela de conferir abriria no arquivo
 * errado de novo.
 */
export const runtime = "nodejs";

export async function POST(request: Request, contexto: { params: Promise<{ id: string }> }) {
  const sessao = await exigirEscrita();
  if (!sessao.ok) return sessao.resposta;

  const { id } = await contexto.params;

  const corpo = await lerCorpo(request);
  if (!corpo || typeof corpo !== "object") {
    return erroJson(400, "corpo_invalido", "Envio malformado.");
  }

  const { acao, observacao, motivo } = corpo as Record<string, unknown>;

  if (acao !== "conferir" && acao !== "pedir_correcao" && acao !== "sem_movimentacao") {
    return erroJson(400, "acao_invalida", "Ação desconhecida.", "acao");
  }

  // O motivo é obrigatório na correção: é ele que entra na mensagem que o
  // cliente recebe. "Pedimos para corrigir" sem dizer o quê gera uma ligação.
  const texto = typeof motivo === "string" ? motivo.trim() : "";
  if (acao === "pedir_correcao" && !texto) {
    return erroJson(422, "sem_motivo", "Diga o que precisa ser corrigido — o cliente recebe este texto.", "motivo");
  }

  const controle = await lerControle(id);
  if (controle.erro) return erroJson(503, "consulta_indisponivel", controle.erro);
  if (!controle.dados) return erroJson(404, "nao_encontrado", "Esta movimentação não existe.");

  // Conferência antecipada: a máquina de passos também recusa, mas aqui a
  // mensagem explica o que mudou em vez de devolver um 409 seco depois de a
  // analista escrever o motivo inteiro.
  if (!podeAgir(controle.dados.passo, acao)) {
    return erroJson(
      409,
      "passo_incompativel",
      "Esta movimentação mudou de etapa. Atualize a página para ver como ela está.",
    );
  }

  const resultado = await aplicarAcaoNoControle(id, acao, sessao.perfil.id, {
    observacao: typeof observacao === "string" && observacao.trim() ? observacao.trim() : null,
    motivo: texto || null,
  });

  if (!resultado.ok) {
    const { status, codigo, mensagem } = resultado.falha;
    return erroJson(status, codigo, mensagem);
  }

  return Response.json({ data: resultado.dados }, { status: 201 });
}

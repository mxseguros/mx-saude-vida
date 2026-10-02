import { erroJson, exigirPerfil } from "@/lib/api";
import { lerControle, lerPlanilhaDoMes } from "@/lib/controles/consulta";
import { lerArquivoDaPlanilha } from "@/lib/controles/planilha";
import { baixarArquivo } from "@/lib/arquivos/servico";
import { cpfsRepetidos } from "@/lib/dominio/planilha";

/**
 * GET /api/v1/controles/[id]/previa — as linhas da planilha do mês.
 *
 * Lê o xlsx do Storage e devolve o que tem dentro, para a tela de conferir
 * mostrar. `exigirPerfil` e não `exigirEscrita`: o perfil de leitura confere o
 * que foi enviado, ele só não decide.
 *
 * Nada é guardado. A prévia é derivada do arquivo a cada abertura, e não uma
 * cópia das linhas numa tabela — cópia envelheceria em relação ao arquivo que a
 * analista baixa, e aí os dois discordariam sobre o que o cliente mandou.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Teto de linhas na resposta. Acima disso a tela pagina pelo arquivo baixado. */
const LINHAS_NA_PREVIA = 500;

export async function GET(_request: Request, contexto: { params: Promise<{ id: string }> }) {
  const sessao = await exigirPerfil();
  if (!sessao.ok) return sessao.resposta;

  const { id } = await contexto.params;

  const controle = await lerControle(id);
  if (controle.erro) return erroJson(503, "consulta_indisponivel", controle.erro);
  if (!controle.dados) return erroJson(404, "nao_encontrado", "Esta movimentação não existe.");

  // "Sem movimentação" é um mês legítimo sem arquivo: a tela mostra isso em vez
  // de um erro.
  if (controle.dados.semMudancas) {
    return Response.json({
      data: { semMudancas: true, planilha: null, linhas: [], total: 0, comProblema: 0 },
    });
  }

  const ficha = await lerPlanilhaDoMes(id);
  if (ficha.erro) return erroJson(503, "consulta_indisponivel", ficha.erro);
  if (!ficha.dados) {
    return Response.json({
      data: { semMudancas: false, planilha: null, linhas: [], total: 0, comProblema: 0 },
    });
  }

  const baixado = await baixarArquivo(ficha.dados.id);
  if (!baixado.ok) {
    const { status, codigo, mensagem } = baixado.falha;
    return erroJson(status, codigo, mensagem);
  }

  const lido = await lerArquivoDaPlanilha(baixado.dados.arquivo);
  if (!lido.ok) {
    return Response.json({
      data: {
        semMudancas: false,
        planilha: ficha.dados,
        linhas: [],
        total: 0,
        comProblema: 0,
        motivo: lido.motivo,
      },
    });
  }

  const { planilha, aba, abas } = lido;

  return Response.json({
    data: {
      semMudancas: false,
      planilha: ficha.dados,
      aba,
      abas,
      cabecalhoNaLinha: planilha.cabecalho ? planilha.cabecalho.linha + 1 : null,
      colunasAusentes: planilha.colunasAusentes,
      total: planilha.total,
      comProblema: planilha.comProblema,
      repetidos: cpfsRepetidos(planilha.linhas).length,
      linhas: planilha.linhas.slice(0, LINHAS_NA_PREVIA),
      cortada: planilha.total > LINHAS_NA_PREVIA,
    },
  });
}

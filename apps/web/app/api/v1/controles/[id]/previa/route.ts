import { erroJson, exigirPerfil } from "@/lib/api";
import { lerControle, lerPlanilhaDoMes } from "@/lib/controles/consulta";
import { lerArquivoDaPlanilha } from "@/lib/controles/planilha";
import { lerMovimentacao } from "@/lib/controles/movimentacao";
import { baixarArquivo } from "@/lib/arquivos/servico";
import { conferir } from "@/lib/dominio/conferencia";
import { hojeSaoPaulo } from "@/lib/dominio/hoje";
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

  /**
   * A movimentação digitada vem SEMPRE, inclusive quando não há planilha.
   *
   * É a entrega 5.1: a tela de conferir mostra quem o gestor informou. Num mês
   * sem planilha é a única coisa que existe para conferir, e esconder isso
   * faria a analista abrir a tela e não ver nada.
   */
  const movimentacao = await lerMovimentacao(id);

  // "Sem movimentação" é um mês legítimo sem arquivo: a tela mostra isso em vez
  // de um erro.
  if (controle.dados.semMudancas) {
    return Response.json({
      data: {
        semMudancas: true,
        planilha: null,
        linhas: [],
        total: 0,
        comProblema: 0,
        movimentacao,
        conferencia: null,
      },
    });
  }

  const ficha = await lerPlanilhaDoMes(id);
  if (ficha.erro) return erroJson(503, "consulta_indisponivel", ficha.erro);
  if (!ficha.dados) {
    // Sem planilha não há o que cruzar, e `conferencia` fica nula: o que a tela
    // mostra é a lista do que o gestor informou. Devolver um cruzamento vazio
    // faria cada pessoa informada virar "fora da planilha" — cem apontamentos
    // dizendo apenas que o arquivo não chegou.
    return Response.json({
      data: {
        semMudancas: false,
        planilha: null,
        linhas: [],
        total: 0,
        comProblema: 0,
        movimentacao,
        conferencia: null,
      },
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
        movimentacao,
        conferencia: null,
      },
    });
  }

  const { planilha, aba, abas } = lido;

  /**
   * O cruzamento roda no SERVIDOR, junto da leitura do arquivo.
   *
   * Ele precisa das duas metades, e mandar a movimentação inteira ao navegador
   * para cruzar lá seria pôr nome e CPF de quarenta pessoas num JSON que
   * nenhuma tela desenha — dado pessoal viajando para nada.
   *
   * Só o que o GESTOR informou entra. O que a analista digitou ela já sabe de
   * onde veio, e cruzar isso geraria apontamento que ninguém resolve.
   */
  const conferencia = conferir(
    movimentacao.filter((m) => m.porQuem === "gestor").map((m) => ({ tipo: m.tipo, nome: m.nome, documento: m.documento })),
    planilha.linhas,
    hojeSaoPaulo(),
  );

  return Response.json({
    data: {
      semMudancas: false,
      planilha: ficha.dados,
      movimentacao,
      conferencia,
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

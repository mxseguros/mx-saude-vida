import { erroJson, exigirEscrita } from "@/lib/api";
import { lerCliente } from "@/lib/clientes/consulta";
import { apoliceParaFormulario, outroSegurado } from "@/lib/dominio/apolice";
import { conferirArquivo } from "@/lib/dominio/arquivo";
import { esquemaApolice, lerApolice, type Apolice } from "@/lib/ia/apolice";
import { TETO_DIARIO_POR_PESSOA_BRL } from "@/lib/ia/custo";
import { hashDoArquivo } from "@/lib/ia/hash";
import { PROMPTS_PADRAO } from "@/lib/ia/prompts";
import { extracaoNoCache, podeGastarHoje, promptAtivo, registrar } from "@/lib/ia/registro";

/**
 * POST /api/v1/clientes/[id]/apolice/leitura — o agente lê o PDF e PROPÕE.
 *
 * Nada vai para `policies` aqui: a analista confere e salva pela outra rota.
 * Mesmo desenho do MX Sinistro: cache por hash antes do teto, teto antes de
 * qualquer chamada paga, e toda execução em `ai_runs`.
 */
export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Escrita, e não só perfil: ler custa dinheiro, e quem só consulta não gasta.
  const sessao = await exigirEscrita();
  if (!sessao.ok) return sessao.resposta;

  const { id } = await params;
  const cliente = await lerCliente(id);
  if (cliente.erro) return erroJson(503, "consulta_indisponivel", cliente.erro);
  if (!cliente.dados) return erroJson(404, "nao_encontrado", "Este cliente não existe.");

  let formulario: FormData;
  try {
    formulario = await request.formData();
  } catch {
    return erroJson(400, "corpo_invalido", "Envio malformado.");
  }
  const arquivo = formulario.get("arquivo");
  if (!(arquivo instanceof File)) return erroJson(400, "sem_arquivo", "Nenhum arquivo enviado.", "arquivo");
  if (arquivo.type !== "application/pdf") {
    return erroJson(422, "nao_e_pdf", "A leitura automática só funciona com a apólice em PDF.", "arquivo");
  }
  const problema = conferirArquivo(arquivo.name, arquivo.size, arquivo.type, "apolice");
  if (problema) return erroJson(422, `arquivo_${problema.tipo}`, problema.mensagem, "arquivo");

  const conteudo = Buffer.from(await arquivo.arrayBuffer());
  const hash = hashDoArquivo(conteudo);
  const documento = cliente.dados.documento;

  const responder = (dados: Apolice, execucaoId: number | null, doCache: boolean) =>
    Response.json({
      data: {
        formulario: apoliceParaFormulario({
          numero: dados.numeroApolice,
          contrato: dados.numeroContrato,
          produto: dados.produto,
          vigenciaInicio: dados.vigenciaInicio,
          vigenciaFim: dados.vigenciaFim,
          taxaPorMil: dados.taxaPorMil,
          limiteDeIdade: dados.limiteDeIdade,
          capital: dados.capital,
        }),
        ilegivel: dados.ilegivel,
        segurado: dados.segurado,
        seguradora: dados.seguradora,
        outroSegurado: outroSegurado(dados.documentoSegurado, documento),
        execucaoId,
        doCache,
      },
    });

  // 1. Cache: reenviar o mesmo PDF não paga de novo.
  const guardada = esquemaApolice.safeParse(await extracaoNoCache("apolice", hash));
  if (guardada.success) {
    const execucaoId = await registrar({
      clienteId: id,
      agente: "apolice",
      promptId: null,
      entradaResumo: `${arquivo.name} · reaproveitado do cache`,
      saida: guardada.data,
      modelo: "cache",
      uso: { entrada: 0, saida: 0 },
      pessoaId: sessao.perfil.id,
      hash,
    });
    return responder(guardada.data, execucaoId, true);
  }

  // 2. Teto diário, antes de qualquer chamada paga.
  if (!(await podeGastarHoje(sessao.perfil.id))) {
    return erroJson(
      429,
      "teto_de_custo",
      `Limite diário de leitura automática atingido (R$ ${TETO_DIARIO_POR_PESSOA_BRL.toFixed(2)}). ` +
        "Preencha à mão — o cadastro não fica bloqueado.",
      "arquivo",
    );
  }

  const prompt = await promptAtivo("apolice", PROMPTS_PADRAO.apolice);
  const leitura = await lerApolice(conteudo, prompt.texto);
  if (!leitura.ok) return erroJson(422, leitura.codigo, leitura.mensagem, "arquivo");

  const execucaoId = await registrar({
    clienteId: id,
    agente: "apolice",
    promptId: prompt.id,
    entradaResumo: `${arquivo.name} · ${Math.round(arquivo.size / 1024)} KB`,
    saida: leitura.dados,
    modelo: leitura.modelo,
    uso: leitura.uso,
    pessoaId: sessao.perfil.id,
    hash,
  });
  return responder(leitura.dados, execucaoId, false);
}

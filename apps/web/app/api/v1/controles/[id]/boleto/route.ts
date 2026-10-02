import { erroJson, exigirEscrita } from "@/lib/api";
import { lerControle } from "@/lib/controles/consulta";
import { aplicarAcaoNoControle } from "@/lib/controles/servico";
import { lerPdfDoBoleto } from "@/lib/controles/boleto";
import { enviarMensagemDoPasso } from "@/lib/controles/envio";
import { enviarArquivo } from "@/lib/arquivos/servico";
import { podeAgir } from "@/lib/dominio/controle";
import { hojeSaoPaulo } from "@/lib/dominio/hoje";
import { valorParaNumero } from "@/lib/dominio/mascaras";

/**
 * As duas metades de "Anexar boleto".
 *
 * `PUT` só LÊ: sobe o PDF, devolve os campos propostos e não toca no mês. É o
 * que permite a analista ver o que o sistema entendeu, corrigir e só então
 * confirmar — e é por isso que ler e gravar são chamadas separadas.
 *
 * `POST` GRAVA: anexa o arquivo, guarda parcela, valor e vencimento, e avança o
 * passo pela máquina de estados.
 */
export const runtime = "nodejs";

/** Confere que o mês existe, é visível e aceita boleto agora. */
async function mesParaBoleto(id: string) {
  const controle = await lerControle(id);
  if (controle.erro) return { erro: erroJson(503, "consulta_indisponivel", controle.erro) };
  if (!controle.dados) return { erro: erroJson(404, "nao_encontrado", "Esta movimentação não existe.") };

  if (!podeAgir(controle.dados.passo, "anexar_boleto")) {
    return {
      erro: erroJson(
        409,
        "passo_incompativel",
        "Esta movimentação não está na etapa de boleto. Atualize a página para ver como ela está.",
      ),
    };
  }

  return { linha: controle.dados };
}

/* -------------------------------------------------------------------------- */
/* PUT — sobe o PDF e devolve o que leu. Não muda o mês.                      */
/* -------------------------------------------------------------------------- */
export async function PUT(request: Request, contexto: { params: Promise<{ id: string }> }) {
  const sessao = await exigirEscrita();
  if (!sessao.ok) return sessao.resposta;

  const { id } = await contexto.params;
  const mes = await mesParaBoleto(id);
  if (mes.erro) return mes.erro;

  let formulario: FormData;
  try {
    formulario = await request.formData();
  } catch {
    return erroJson(400, "corpo_invalido", "Não consegui ler o arquivo enviado.");
  }

  const arquivo = formulario.get("arquivo");
  if (!(arquivo instanceof File)) {
    return erroJson(400, "sem_arquivo", "Escolha o PDF do boleto.");
  }

  const guardado = await enviarArquivo(
    {
      clienteId: mes.linha.clienteId,
      controleId: id,
      competencia: mes.linha.competencia,
      tipo: "boleto",
      arquivo,
    },
    { perfilId: sessao.perfil.id },
  );

  if (!guardado.ok) {
    const { status, codigo, mensagem } = guardado.falha;
    return erroJson(status, codigo, mensagem);
  }

  // A leitura vem DEPOIS de guardar: se ela falhar, o arquivo já está salvo e a
  // analista só precisa digitar os campos — não reenviar o PDF.
  const lido = await lerPdfDoBoleto(arquivo, hojeSaoPaulo());

  return Response.json({
    data: {
      arquivo: { id: guardado.dados.id, nome: guardado.dados.nome, tamanho: guardado.dados.tamanho },
      campos: lido,
    },
  });
}

/* -------------------------------------------------------------------------- */
/* POST — confirma: grava os campos e avança o passo.                         */
/* -------------------------------------------------------------------------- */
export async function POST(request: Request, contexto: { params: Promise<{ id: string }> }) {
  const sessao = await exigirEscrita();
  if (!sessao.ok) return sessao.resposta;

  const { id } = await contexto.params;
  const mes = await mesParaBoleto(id);
  if (mes.erro) return mes.erro;

  const corpo = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return erroJson(400, "corpo_invalido", "Envio malformado.");

  const arquivoId = typeof corpo.arquivo === "string" && corpo.arquivo ? corpo.arquivo : null;
  if (!arquivoId) return erroJson(422, "sem_arquivo", "Anexe o PDF do boleto antes de salvar.", "arquivo");

  // O valor chega como texto do campo com máscara de moeda.
  const valor =
    typeof corpo.valor === "number"
      ? corpo.valor
      : typeof corpo.valor === "string"
        ? valorParaNumero(corpo.valor)
        : null;

  if (valor === null || valor <= 0) {
    return erroJson(422, "valor_invalido", "Informe o valor do boleto.", "valor");
  }

  const vencimento = typeof corpo.vencimento === "string" ? corpo.vencimento : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vencimento)) {
    return erroJson(422, "vencimento_invalido", "Informe o vencimento do boleto.", "vencimento");
  }

  const parcela = typeof corpo.parcela === "string" && corpo.parcela.trim() ? corpo.parcela.trim() : null;
  const observacao = typeof corpo.observacao === "string" && corpo.observacao.trim() ? corpo.observacao.trim() : null;

  const resultado = await aplicarAcaoNoControle(id, "anexar_boleto", sessao.perfil.id, {
    observacao,
    boleto: { arquivoId, valor, parcela, vencimento },
  });

  if (!resultado.ok) {
    const { status, codigo, mensagem } = resultado.falha;
    return erroJson(status, codigo, mensagem);
  }

  // Avisa o cliente AGORA, com o PDF junto. A janela promete "salvar e avisar o
  // cliente", e promessa de tela que o código não cumpre é defeito.
  //
  // Nunca derruba a resposta: anexar deu certo, e perder isso porque o
  // provedor de e-mail está fora seria trocar trabalho feito por nada. O aviso
  // volta no corpo e a tela mostra.
  const envio = await enviarMensagemDoPasso(id, "boleto", sessao.perfil.id);

  return Response.json({ data: { ...resultado.dados, envio } }, { status: 201 });
}

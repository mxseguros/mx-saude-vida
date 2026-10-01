import { erroJson } from "@/lib/api";
import { exigirCliente } from "@/lib/portal/sessao";
import { lerMes } from "@/lib/portal/consulta";
import { enviarArquivo } from "@/lib/arquivos/servico";
import { podeEnviarPlanilha } from "@/lib/dominio/portal";

/**
 * POST /api/portal/planilha — multipart: `arquivo`, `controle`
 *
 * Só sobe o arquivo e devolve o id. NÃO move o passo do mês: quem faz isso é
 * `POST /api/portal/envio`, depois da revisão. A separação é o que permite o
 * gestor trocar o arquivo antes de confirmar — e o que evita o mês avançar
 * porque alguém errou o anexo e fechou a aba.
 *
 * `multipart`, e não JSON com base64: base64 cresce o corpo em um terço, e o
 * limite de corpo de uma função é 4,5 MB.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const sessao = await exigirCliente();
  if (!sessao.ok) return sessao.resposta;

  let formulario: FormData;
  try {
    formulario = await request.formData();
  } catch {
    return erroJson(400, "corpo_invalido", "Não consegui ler o arquivo enviado.");
  }

  const arquivo = formulario.get("arquivo");
  const controleId = String(formulario.get("controle") ?? "");

  if (!(arquivo instanceof File)) {
    return erroJson(400, "sem_arquivo", "Escolha um arquivo para enviar.");
  }
  if (!controleId) {
    return erroJson(400, "sem_controle", "Não sei a qual mês este arquivo pertence.");
  }

  // O mês tem de ser do cliente da sessão — `lerMes` usa a RLS, então um id de
  // outra empresa simplesmente não é encontrado.
  const mes = await lerMes(controleId);
  if (mes.erro) return erroJson(503, "consulta_indisponivel", mes.erro);
  if (!mes.dados) return erroJson(404, "nao_encontrado", "Este mês não está disponível na sua conta.");

  // Mês que já passou da etapa de informar não aceita arquivo novo. Sem esta
  // conferência, o arquivo subiria e o envio seguinte devolveria 409 — o gestor
  // teria esperado o upload inteiro para ouvir que não valia.
  if (!podeEnviarPlanilha(mes.dados.passo)) {
    return erroJson(
      409,
      "passo_incompativel",
      "Este mês não está mais aguardando a sua planilha. Atualize a página para ver como ele está.",
    );
  }

  const resultado = await enviarArquivo(
    {
      clienteId: sessao.cliente.clienteId,
      controleId,
      competencia: mes.dados.competencia,
      tipo: "planilha",
      arquivo,
    },
    { clienteUsuarioId: sessao.cliente.id },
  );

  if (!resultado.ok) {
    const { status, codigo, mensagem } = resultado.falha;
    return erroJson(status, codigo, mensagem);
  }

  return Response.json({ data: resultado.dados }, { status: 201 });
}

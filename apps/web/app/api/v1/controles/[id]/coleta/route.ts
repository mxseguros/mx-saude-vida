import { esquemaColeta } from "@/lib/dominio/coleta";
import { validar } from "@/lib/dominio/validar";
import { gerarLinkDeColeta } from "@/lib/controles/coleta";
import { registrarColetaPelaEquipe } from "@/lib/coleta/servico";
import { erroJson, exigirEscrita, lerCorpo } from "@/lib/api";
import { urlBase } from "@/lib/ambiente";

/**
 * A coleta pelo lado da MX: gerar o link, ou digitar o que o gestor mandou.
 *
 * Duas coisas na mesma rota porque são a mesma tela e a mesma decisão — "como
 * esta movimentação vai chegar". `PUT` gera o link; `POST` grava o que a
 * analista digitou.
 *
 * As duas exigem ESCRITA. Gerar link é escrita porque o token é a credencial
 * de quem vai informar as vidas da empresa, e quem só lê não distribui
 * credencial — a RLS faz a mesma pergunta no banco.
 */

/**
 * Gera (ou refaz) o link e devolve a URL pronta.
 *
 * Refazer troca o token de propósito: quando o gestor muda, ou quando o celular
 * estava errado e o link foi para o número de alguém de fora, o link antigo tem
 * de morrer. Manter os dois abertos deixaria a porta velha destrancada.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await exigirEscrita();
  if (!sessao.ok) return sessao.resposta;

  const { id } = await params;

  const corpo = await lerCorpo(request);
  if (!corpo || typeof corpo !== "object") return erroJson(400, "corpo_invalido", "Envio malformado.");

  const bruto = corpo as Record<string, unknown>;
  const nome = texto(bruto.nome);
  const celular = texto(bruto.celular);
  const setor = texto(bruto.setor);

  if (nome.length < 3) return erroJson(422, "gestor_sem_nome", "Informe o nome de quem vai receber o link.", "nome");

  const resultado = await gerarLinkDeColeta(id, { nome, celular, setor: setor || null }, sessao.perfil.id);
  if (!resultado.ok) {
    const { status, codigo, mensagem } = resultado.falha;
    return erroJson(status, codigo, mensagem);
  }

  return Response.json(
    {
      data: {
        // A URL pronta, montada no servidor: o navegador não precisa saber
        // como se escreve um endereço de coleta, e quando o domínio mudar há um
        // lugar só para corrigir.
        url: `${urlBase()}/coleta/${resultado.dados.token}`,
        valeAte: resultado.dados.valeAte,
      },
    },
    { status: 200 },
  );
}

/**
 * A analista digita o que o gestor mandou por fora.
 *
 * O MESMO esquema zod do formulário público (regra 3): a movimentação é a
 * mesma, e duas validações diferentes para o mesmo dado acabariam aceitando
 * pela MX um CPF que o gestor não conseguiria enviar.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await exigirEscrita();
  if (!sessao.ok) return sessao.resposta;

  const { id } = await params;

  const corpo = await lerCorpo(request);
  if (!corpo) return erroJson(400, "corpo_invalido", "Envio malformado.");

  const analise = validar(esquemaColeta, corpo);
  if (!analise.ok) {
    return Response.json(
      {
        error: {
          code: "campos_invalidos",
          message: "Confira os campos destacados.",
          fields: analise.erros,
        },
      },
      { status: 422 },
    );
  }

  const resultado = await registrarColetaPelaEquipe(id, analise.dados, sessao.perfil.id);
  if (!resultado.ok) {
    const { status, codigo, mensagem } = resultado.falha;
    return erroJson(status, codigo, mensagem);
  }

  return Response.json({ data: resultado.dados }, { status: 200 });
}

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

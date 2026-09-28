import { erroJson, exigirEscrita, exigirPerfil, lerCorpo } from "@/lib/api";
import { listarClientes } from "@/lib/clientes/consulta";
import { criarCliente } from "@/lib/clientes/servico";
import { esquemaCliente } from "@/lib/dominio/cliente";
import { validar } from "@/lib/dominio/validar";

/**
 * GET /api/v1/clientes?q=termo&situacao=ativos
 *
 * Exige sessão como todo o resto: a lista tem CNPJ, e-mail e telefone da
 * carteira inteira, e uma rota de busca aberta seria a forma mais confortável
 * de baixá-la.
 */
export async function GET(request: Request) {
  const sessao = await exigirPerfil();
  if (!sessao.ok) return sessao.resposta;

  const params = new URL(request.url).searchParams;
  const situacao = params.get("situacao");

  const resultado = await listarClientes({
    termo: params.get("q") ?? "",
    situacao: situacao === "inativos" || situacao === "todos" ? situacao : "ativos",
  });

  if (resultado.erro) return erroJson(503, "consulta_indisponivel", resultado.erro);
  return Response.json({ data: resultado.dados });
}

/**
 * POST /api/v1/clientes
 *
 * O MESMO esquema zod do formulário valida aqui, e devolve todos os erros de
 * uma vez, cada um apontando o campo. Quem grava é o cliente da sessão: a RLS
 * decide, e `exigirEscrita` barra o perfil de leitura antes, com a mensagem
 * certa em vez de um resultado vazio.
 */
export async function POST(request: Request) {
  const sessao = await exigirEscrita();
  if (!sessao.ok) return sessao.resposta;

  const corpo = await lerCorpo(request);
  if (!corpo) return erroJson(400, "corpo_invalido", "Envio malformado.");

  const analise = validar(esquemaCliente, corpo);
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

  const resultado = await criarCliente(analise.dados, sessao.perfil.id);
  if (!resultado.ok) {
    const { status, codigo, mensagem, campo } = resultado.falha;
    return erroJson(status, codigo, mensagem, campo);
  }

  return Response.json({ data: resultado.dados }, { status: 201 });
}

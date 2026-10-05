import { esquemaColeta, pareceToken } from "@/lib/dominio/coleta";
import { validar } from "@/lib/dominio/validar";
import { registrarColeta } from "@/lib/coleta/servico";
import { erroJson, lerCorpo } from "@/lib/api";

/**
 * O envio do formulário de coleta. **Rota pública.**
 *
 * Fora de `/api/v1` de propósito: `/api/v1` é da equipe e passa por
 * `exigirPerfil`. Esta não tem sessão nenhuma, e a separação por endereço é o
 * que impede alguém de adicionar aqui uma chamada que presuma perfil.
 *
 * Quem autoriza é o TOKEN, e ele vem no endereço, não no corpo. O corpo traz o
 * que o gestor digitou e nada mais: cliente, mês, passo e "quem digitou" são
 * decididos no servidor a partir do token — aceitar qualquer um deles daqui
 * seria deixar quem tem um link escrever no mês de outro cliente.
 *
 * O MESMO esquema zod do formulário valida aqui (regra 3), e devolve todos os
 * erros de uma vez com o campo de cada um. A validação do navegador é cortesia;
 * esta é a que vale.
 */

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  /**
   * O FORMATO do token vem antes de tudo, e sem ir ao banco.
   *
   * A ordem importa numa rota aberta na internet: validar o corpo primeiro
   * faria o servidor analisar com zod qualquer JSON que chegasse, de qualquer
   * endereço, sem nenhuma credencial — e isso é trabalho de graça para quem
   * estiver varrendo. O token é o mais barato de recusar: é uma expressão
   * regular.
   */
  if (!pareceToken(token)) {
    return erroJson(404, "link_invalido", "Este link não é válido.");
  }

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

  const resultado = await registrarColeta(token, analise.dados);
  if (!resultado.ok) {
    const { status, codigo, mensagem } = resultado.falha;
    return erroJson(status, codigo, mensagem);
  }

  return Response.json({ data: resultado.dados }, { status: 200 });
}

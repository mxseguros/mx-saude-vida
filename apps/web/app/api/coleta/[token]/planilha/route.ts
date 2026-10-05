import { enviarArquivo } from "@/lib/arquivos/servico";
import { mesDoToken } from "@/lib/coleta/consulta";
import { clienteAdministrador } from "@/lib/supabase/administrador";
import { erroJson } from "@/lib/api";

/**
 * A planilha do mês, pelo link. **Rota pública.**
 *
 * Sobe ANTES do envio do formulário, e por isso é uma rota separada: o upload
 * tem progresso, e progresso precisa de `XMLHttpRequest`, que fala com uma URL
 * própria. Quem está no 4G com uma planilha de 2 MB precisa ver "62%" em vez de
 * uma tela parada.
 *
 * O arquivo nasce sem autor em `profiles`: o gestor não tem conta. Quem mandou
 * se lê no contato do mês (`manager_name`).
 *
 * `clienteId`, `controleId` e `competencia` vêm do TOKEN, nunca do corpo. É o
 * ponto desta rota: o caminho no bucket começa pelo `client_id`, e aceitar esse
 * valor de fora deixaria quem tem um link gravar na pasta de outro cliente.
 */

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const mes = await mesDoToken(token);
  if (!mes.ok) {
    return mes.estado === "expirado"
      ? erroJson(410, "link_expirado", "Este link fechou. Fale com a MX para receber um novo.")
      : erroJson(404, "link_invalido", "Este link não é válido.");
  }

  let formulario: FormData;
  try {
    formulario = await request.formData();
  } catch {
    return erroJson(400, "corpo_invalido", "Envio malformado.");
  }

  const arquivo = formulario.get("arquivo");
  if (!(arquivo instanceof File)) {
    return erroJson(422, "arquivo_faltando", "Escolha o arquivo da planilha.");
  }

  const resultado = await enviarArquivo(
    {
      clienteId: mes.clienteId,
      controleId: mes.controleId,
      competencia: mes.competencia,
      tipo: "planilha",
      arquivo,
    },
    // Sem autor: veio pelo link.
    null,
    // Sem sessão: grava com a chave de administração, depois de o token valer.
    clienteAdministrador(),
  );

  if (!resultado.ok) {
    const { status, codigo, mensagem } = resultado.falha;
    return erroJson(status, codigo, mensagem);
  }

  return Response.json({ data: { id: resultado.dados.id, nome: resultado.dados.nome } }, { status: 201 });
}

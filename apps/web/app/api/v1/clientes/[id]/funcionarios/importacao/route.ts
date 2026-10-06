import { erroJson, exigirEscrita } from "@/lib/api";
import { lerArquivoDaPlanilha } from "@/lib/controles/planilha";
import { conferirArquivo } from "@/lib/dominio/arquivo";
import { planoDeImportacao } from "@/lib/dominio/funcionario";
import { aplicarImportacao, listarFuncionarios } from "@/lib/funcionarios/servico";

/**
 * POST — importar a planilha de funcionários, em dois passos com o MESMO
 * arquivo: sem `confirmar` devolve o que vai mudar; com `confirmar=1` grava.
 * O arquivo não fica guardado: a base é o que importa, não a planilha.
 */
export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await exigirEscrita();
  if (!sessao.ok) return sessao.resposta;
  const { id } = await params;

  let formulario: FormData;
  try {
    formulario = await request.formData();
  } catch {
    return erroJson(400, "corpo_invalido", "Envio malformado.");
  }
  const arquivo = formulario.get("arquivo");
  if (!(arquivo instanceof File)) return erroJson(422, "arquivo_faltando", "Escolha a planilha.");
  const problema = conferirArquivo(arquivo.name, arquivo.size, arquivo.type, "planilha");
  if (problema) return erroJson(422, `arquivo_${problema.tipo}`, problema.mensagem);

  const lido = await lerArquivoDaPlanilha(arquivo);
  if (!lido.ok) return erroJson(422, "planilha_ilegivel", lido.motivo);
  if (!lido.planilha.cabecalho) {
    return erroJson(422, "sem_cabecalho", "Não achei o cabeçalho com Nome e CPF. Use o modelo de importação.");
  }

  const existentes = await listarFuncionarios(id);
  if (existentes.erro) return erroJson(503, "consulta_indisponivel", existentes.erro);
  const plano = planoDeImportacao(existentes.dados, lido.planilha.linhas);

  if (formulario.get("confirmar") !== "1") {
    return Response.json({
      data: {
        aba: lido.aba,
        novos: plano.novos.length,
        atualizar: plano.atualizar.length,
        readmitir: plano.readmitir.length,
        ignorados: plano.ignorados.slice(0, 50),
        totalIgnorados: plano.ignorados.length,
        colunasAusentes: lido.planilha.colunasAusentes,
      },
    });
  }

  const r = await aplicarImportacao(id, plano, sessao.perfil.id);
  if (!r.ok) return erroJson(r.falha.status, r.falha.codigo, r.falha.mensagem);
  return Response.json({ data: r.dados });
}

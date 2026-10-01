import "server-only";

import { clienteServidor } from "../supabase/servidor";
import { caminhoDoArquivo, conferirArquivo, type TipoDeArquivo } from "../dominio/arquivo";
import type { Falha, ResultadoEscrita } from "../clientes/servico";

/**
 * Arquivos do cliente.
 *
 * O bucket `client-files` é PRIVADO e nunca vira público: a planilha do mês
 * carrega nome, CPF e data de nascimento de cada funcionário. Todo acesso passa
 * por URL assinada de vida curta, gerada aqui para quem tem sessão.
 *
 * O upload sobe pelo servidor com o cliente da SESSÃO — nunca com a chave
 * secreta. Assim a política do Storage continua valendo: `client_files_own_write`
 * compara a primeira pasta do caminho com `client_id_of_user()`, e um gestor que
 * descobrisse a rota e trocasse o `client_id` no corpo esbarraria no banco.
 */

/** Dois minutos: tempo de clicar e baixar, não de encaminhar o link por e-mail. */
export const VALIDADE_URL_SEGUNDOS = 120;

const BUCKET = "client-files";

/** `spreadsheet` | `invoice` | `policy` — o que a coluna `kind` guarda. */
const TIPO_PARA_O_BANCO: Record<TipoDeArquivo, string> = {
  planilha: "spreadsheet",
  boleto: "invoice",
  apolice: "policy",
};

/** A pasta dentro do cliente. A apólice não é de um mês; as outras são. */
function pastaDe(tipo: TipoDeArquivo, competencia: string | null): string {
  if (tipo === "apolice") return "apolice";
  return competencia ?? "sem-mes";
}

function falha(status: number, codigo: string, mensagem: string): { ok: false; falha: Falha } {
  return { ok: false, falha: { status, codigo, mensagem } };
}

export type ArquivoGravado = {
  id: string;
  nome: string;
  tamanho: number;
};

/**
 * Sobe o arquivo e grava a ficha, nessa ordem.
 *
 * A ORDEM IMPORTA e é a oposta da intuitiva. Se a ficha entrasse primeiro e o
 * upload falhasse, o cliente veria a planilha listada em Meus documentos e o
 * download daria 404 para sempre — e ninguém saberia dizer se o arquivo chegou.
 * Com o upload primeiro, a falha da ficha deixa no bucket um objeto que nenhuma
 * tela mostra: invisível, e removível depois. Lixo é melhor que mentira.
 */
export async function enviarArquivo(
  parametros: {
    clienteId: string;
    controleId: string | null;
    competencia: string | null;
    tipo: TipoDeArquivo;
    arquivo: File;
  },
  autor: { perfilId: string } | { clienteUsuarioId: string },
): Promise<ResultadoEscrita<ArquivoGravado>> {
  const { clienteId, controleId, competencia, tipo, arquivo } = parametros;

  // A mesma conferência que o navegador faz, de novo: a primeira é cortesia, e
  // esta é a que vale.
  const problema = conferirArquivo(arquivo.name, arquivo.size, arquivo.type, tipo);
  if (problema) return falha(422, `arquivo_${problema.tipo}`, problema.mensagem);

  try {
    const supabase = await clienteServidor();

    const identificador = crypto.randomUUID();
    const caminho = caminhoDoArquivo(clienteId, pastaDe(tipo, competencia), arquivo.name, identificador);

    const { error: erroUpload } = await supabase.storage.from(BUCKET).upload(caminho, arquivo, {
      contentType: arquivo.type || "application/octet-stream",
      // Caminho tem uuid: colisão não acontece, e permitir sobrescrita só
      // abriria espaço para um caminho forjado apagar arquivo existente.
      upsert: false,
    });

    if (erroUpload) {
      // A política do Storage recusa com mensagem genérica. Traduzir aqui é o
      // que diferencia "você não pode" de "o sistema quebrou".
      if (/policy|unauthorized|denied/i.test(erroUpload.message)) {
        return falha(403, "sem_permissao", "Você não tem permissão para enviar arquivo neste cadastro.");
      }
      if (/mime|content type/i.test(erroUpload.message)) {
        return falha(422, "arquivo_formato", "Este formato de arquivo não é aceito.");
      }
      return falha(503, "upload_falhou", "Não foi possível enviar o arquivo agora. Tente de novo.");
    }

    const ficha: Record<string, unknown> = {
      client_id: clienteId,
      control_id: controleId,
      kind: TIPO_PARA_O_BANCO[tipo],
      storage_path: caminho,
      original_name: arquivo.name,
      size_bytes: arquivo.size,
      // `mime` e `not null` no banco: arquivo vindo do Drive chega sem tipo,
      // e o generico e melhor que recusar o envio por causa disso.
      mime: arquivo.type || "application/octet-stream",
    };

    // Um autor, nunca os dois: `client_files_um_autor` é um check no banco, e a
    // política do cliente exige que seja ele mesmo.
    if ("perfilId" in autor) ficha.uploaded_by_profile = autor.perfilId;
    else ficha.uploaded_by_client_user = autor.clienteUsuarioId;

    const { data, error } = await supabase.from("client_files").insert(ficha).select("id").single();

    if (error || !data) {
      // O objeto fica órfão no bucket. Não tento remover: a política de delete
      // é só do administrador, então a tentativa falharia e eu trocaria uma
      // mensagem útil por um erro confuso.
      return falha(503, "ficha_falhou", "O arquivo subiu, mas não consegui registrá-lo. Tente enviar de novo.");
    }

    return { ok: true, dados: { id: (data as { id: string }).id, nome: arquivo.name, tamanho: arquivo.size } };
  } catch {
    return falha(503, "sem_banco", "Não foi possível falar com o servidor.");
  }
}

/**
 * A URL de download, válida por dois minutos.
 *
 * Não devolve o arquivo: devolve o endereço temporário dele. Servir o conteúdo
 * pela nossa rota faria cada download passar pela função, com o custo e o
 * limite de corpo que isso traz; a URL assinada entrega direto do Storage.
 *
 * Quem pode baixar é decidido pela RLS na leitura da ficha. Se a consulta
 * abaixo não achar a linha, é porque a pessoa não alcança aquele arquivo — e a
 * resposta é 404, não 403: dizer "existe mas não é seu" conta a quem procura
 * que o arquivo existe.
 */
export async function urlAssinada(arquivoId: string): Promise<ResultadoEscrita<{ url: string; nome: string }>> {
  try {
    const supabase = await clienteServidor();

    const { data: ficha, error } = await supabase
      .from("client_files")
      .select("storage_path, original_name, deleted_at")
      .eq("id", arquivoId)
      .maybeSingle();

    if (error) return falha(503, "sem_banco", "Não foi possível falar com o banco de dados.");

    const linha = ficha as { storage_path: string; original_name: string; deleted_at: string | null } | null;
    if (!linha || linha.deleted_at) {
      return falha(404, "nao_encontrado", "Este arquivo não está disponível.");
    }

    const { data, error: erroUrl } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(linha.storage_path, VALIDADE_URL_SEGUNDOS, { download: linha.original_name });

    if (erroUrl || !data?.signedUrl) {
      return falha(503, "url_falhou", "Não foi possível abrir o arquivo agora. Tente de novo.");
    }

    return { ok: true, dados: { url: data.signedUrl, nome: linha.original_name } };
  } catch {
    return falha(503, "sem_banco", "Não foi possível falar com o servidor.");
  }
}

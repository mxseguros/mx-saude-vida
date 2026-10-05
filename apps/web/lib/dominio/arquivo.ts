/**
 * Regras de arquivo. Puras — o mesmo julgamento roda no navegador, para avisar
 * cedo, e no servidor, que é quem de fato recusa.
 *
 * O que o cliente manda é a planilha de vidas do mês: ela carrega nome, CPF e
 * data de nascimento de cada funcionário. Por isso o bucket é privado e a lista
 * de formatos é curta — aceitar qualquer coisa transforma o bucket em disco de
 * rede, e disco de rede com CPF dentro é um problema de LGPD esperando a hora.
 */

/** O teto do bucket `client-files`, repetido aqui para o aviso sair antes do upload. */
export const TAMANHO_MAXIMO = 20 * 1024 * 1024;

export type TipoDeArquivo = "planilha" | "boleto" | "apolice";

/** `spreadsheet` | `invoice` | `policy` no banco. A tradução vive em `mapear.ts`. */
export const TIPOS_DE_ARQUIVO: readonly TipoDeArquivo[] = ["planilha", "boleto", "apolice"] as const;

export const ROTULO_ARQUIVO: Record<TipoDeArquivo, string> = {
  planilha: "Planilha do mês",
  boleto: "Boleto",
  apolice: "Apólice",
};

/**
 * Formatos por tipo.
 *
 * A planilha aceita xlsx, xls e csv — e PDF, porque parte dos clientes manda a
 * relação de vidas assim e recusar na porta só faria a pessoa ligar para a
 * analista. O boleto e a apólice são PDF.
 *
 * A lista precisa caber na do bucket (`allowed_mime_types` na migration de
 * arquivos): o Storage recusa o que não está lá, e a recusa dele é um erro
 * genérico que não explica nada a quem está enviando.
 */
const FORMATOS: Record<TipoDeArquivo, readonly string[]> = {
  planilha: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/csv",
    "application/pdf",
  ],
  boleto: ["application/pdf"],
  apolice: ["application/pdf"],
};

const COMO_CHAMAR: Record<TipoDeArquivo, string> = {
  planilha: "Envie a planilha em xlsx, xls, csv ou PDF.",
  boleto: "Envie o boleto em PDF.",
  apolice: "Envie a apólice em PDF.",
};

/**
 * A extensão também conta.
 *
 * O `type` de um `File` vem do sistema operacional e chega vazio com
 * frequência — celular com arquivo vindo do Drive é o caso comum. Recusar por
 * MIME vazio barraria gente com arquivo bom; aceitar qualquer coisa sem MIME
 * abriria a porta. A extensão desempata.
 */
const EXTENSOES: Record<TipoDeArquivo, readonly string[]> = {
  planilha: [".xlsx", ".xls", ".csv", ".pdf"],
  boleto: [".pdf"],
  apolice: [".pdf"],
};

export type ProblemaDoArquivo =
  | { tipo: "vazio"; mensagem: string }
  | { tipo: "grande"; mensagem: string }
  | { tipo: "formato"; mensagem: string };

export function extensaoDe(nome: string): string {
  const ponto = nome.lastIndexOf(".");
  return ponto === -1 ? "" : nome.slice(ponto).toLowerCase();
}

/** Em MB com uma casa, para a mensagem falar de arquivo e não de bytes. */
export function emMegabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** Devolve o problema, ou `null` quando o arquivo serve. */
export function conferirArquivo(
  nome: string,
  tamanho: number,
  mimeType: string,
  tipo: TipoDeArquivo = "planilha",
): ProblemaDoArquivo | null {
  if (tamanho <= 0) {
    return { tipo: "vazio", mensagem: "Este arquivo está vazio. Confira se o salvamento terminou." };
  }

  if (tamanho > TAMANHO_MAXIMO) {
    return {
      tipo: "grande",
      mensagem: `O arquivo tem ${emMegabytes(tamanho)} e o limite é ${emMegabytes(TAMANHO_MAXIMO)}.`,
    };
  }

  const extensao = extensaoDe(nome);
  const extensaoServe = EXTENSOES[tipo].includes(extensao);
  const mimeServe = mimeType !== "" && FORMATOS[tipo].includes(mimeType);

  // Basta uma das duas: MIME vazio com extensão certa passa, e MIME certo com
  // nome sem extensão também.
  if (!extensaoServe && !mimeServe) {
    return { tipo: "formato", mensagem: COMO_CHAMAR[tipo] };
  }

  return null;
}

/**
 * O caminho do objeto no bucket: `<client_id>/<pasta>/<uuid>-<nome>`.
 *
 * A primeira pasta é o `client_id`. Isso já foi a política do Storage, quando
 * havia cliente logado: `client_files_own_read` comparava
 * `(storage.foldername(name))[1]` com o cliente da sessão. Essas políticas
 * saíram com o portal (05/10), e hoje só a equipe e o servidor alcançam o
 * bucket — ninguém mais depende desta ordem para ser barrado.
 *
 * Ela fica porque continua valendo por dois motivos: a varredura de retenção e
 * a auditoria perguntam "o que é deste cliente?", e é esta pasta que responde;
 * e se um dia voltar a existir acesso por cliente, a separação já está feita.
 */
export function caminhoDoArquivo(
  clienteId: string,
  pasta: string,
  nome: string,
  identificador: string,
): string {
  return `${clienteId}/${pasta}/${identificador}-${nomeSeguro(nome)}`;
}

/**
 * O nome de arquivo que pode entrar numa chave do Storage.
 *
 * Acento, espaço e barra no nome viram chave inválida ou, pior, chave que
 * escapa da pasta: `../` num nome de arquivo é travessia de diretório. Sobra
 * letra, número, ponto, hífen e sublinhado.
 */
export function nomeSeguro(nome: string): string {
  const limpo = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+/, "")
    .slice(0, 120);

  return limpo || "arquivo";
}

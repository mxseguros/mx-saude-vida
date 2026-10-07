/**
 * Abrir a mensagem no programa de quem envia: o Outlook (`mailto:`) ou o
 * WhatsApp (`wa.me`). Tudo dentro do CLIQUE, antes de qualquer `await`: aberto
 * depois de uma ida à rede, o navegador trata como pop-up e bloqueia.
 */

/** O `mailto:` por âncora: `window.open` deixaria uma aba em branco aberta. */
export function abrirNoOutlook(link: string): void {
  const a = document.createElement("a");
  a.href = link;
  a.click();
}

export function abrirNoWhatsapp(link: string): void {
  // Sem `noopener` na chamada: com ele `window.open` devolve null por
  // especificação. Zerar o opener logo em seguida protege igual.
  const janela = window.open(link, "_blank");
  if (janela) janela.opener = null;
}

/**
 * Baixa o PDF do boleto para a analista arrastar no e-mail (o `mailto:` não
 * leva anexo). A rota devolve a URL assinada com download, então a página não
 * sai do lugar.
 */
export function baixarArquivo(arquivoId: string): void {
  const a = document.createElement("a");
  a.href = `/api/v1/arquivos/${arquivoId}`;
  a.click();
}

/**
 * Para onde mandar a pessoa depois do login.
 *
 * O destino vem da query, então vem de fora e não é confiável. Duas coisas
 * precisam ser verdade ao mesmo tempo, e a implementação anterior só conseguia
 * uma delas:
 *
 * NÃO PODE SAIR DO SITE. Destino controlado por quem monta o link é redirect
 * aberto — o clássico "entre no sistema" que leva a uma cópia da tela de login
 * em outro domínio.
 *
 * PRECISA PRESERVAR A QUERY. O middleware guarda o caminho **com** a busca, de
 * propósito: sem isso, quem clicou em `/controle?status=corte` volta do login numa
 * lista sem filtro e refaz o que já tinha feito.
 *
 * O código anterior fazia `url.pathname = destino`. Isso resolvia a primeira —
 * atribuir a `pathname` mantém a origem, então `//evil.com` virava um caminho
 * do próprio site — e quebrava a segunda, porque o `?` era escapado como
 * `%3F` e `/controle?status=X` virava um 404.
 *
 * Aqui as duas partes são separadas antes de qualquer atribuição.
 */

/**
 * A RAIZ, e não `/controle`.
 *
 * O sistema tem dois públicos e `app/page.tsx` é quem decide entre eles. Um
 * destino inválido levando direto ao Controle mandaria o gestor do cliente a
 * uma tela que não é dele — e o fallback é justamente o caminho de quem veio
 * com link estranho, que é quando acertar importa mais.
 */
export const DESTINO_PADRAO = "/";

export type Destino = { caminho: string; consulta: string };

const PADRAO: Destino = { caminho: DESTINO_PADRAO, consulta: "" };

export function destinoSeguro(bruto: string | null | undefined): Destino {
  const valor = (bruto ?? "").trim();

  // Precisa ser caminho absoluto do próprio site.
  if (!valor.startsWith("/")) return PADRAO;

  // `//evil.com` é URL relativa a protocolo: o navegador a trata como outro
  // domínio. `/\evil.com` é a mesma coisa — vários navegadores normalizam a
  // barra invertida para barra antes de resolver.
  if (valor.startsWith("//") || valor.startsWith("/\\")) return PADRAO;

  // Barra invertida em qualquer posição sai fora: não há caminho legítimo
  // nosso com ela, e ela é o ingrediente das variantes de contorno.
  if (valor.includes("\\")) return PADRAO;

  // O fragmento nunca chega ao servidor; carregá-lo adiante só cria caminho
  // estranho.
  const semFragmento = valor.split("#")[0] ?? "";

  const corte = semFragmento.indexOf("?");
  if (corte === -1) {
    return { caminho: semFragmento || DESTINO_PADRAO, consulta: "" };
  }

  const caminho = semFragmento.slice(0, corte);
  const consulta = semFragmento.slice(corte);

  // `?` logo no começo deixaria o caminho vazio.
  if (!caminho.startsWith("/")) return PADRAO;

  // Query sem nada depois do `?` não serve para nada e suja a URL.
  return { caminho, consulta: consulta === "?" ? "" : consulta };
}

/**
 * O destino já validado, como um texto só.
 *
 * Para quem navega com uma string e não com um objeto `URL` — o
 * `router.replace()` do formulário de senha e o `emailRedirectTo` do magic
 * link. Passar a query crua para o `router.replace()` era redirect aberto: o
 * roteador do Next aceita URL absoluta e sai do site.
 */
export function caminhoSeguro(bruto: string | null | undefined): string {
  const { caminho, consulta } = destinoSeguro(bruto);
  return `${caminho}${consulta}`;
}

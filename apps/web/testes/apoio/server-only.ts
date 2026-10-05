/**
 * `server-only` no vitest.
 *
 * O pacote de verdade exporta um modulo que LANCA quando resolvido fora do
 * servidor — e e isso que ele deve fazer, porque e a trava que impede um
 * modulo com chave secreta de ser puxado para o navegador.
 *
 * No vitest nao ha condicao `react-server`, entao ele resolve a entrada de
 * cliente e qualquer teste de modulo de servidor morre em "This module cannot
 * be imported from a Client Component module".
 *
 * Este arquivo vazio e o que o alias do `vitest.config.ts` aponta no lugar. A
 * trava continua valendo onde importa — na compilacao do Next —, e aqui os
 * modulos de servidor passam a ser testaveis.
 */
export {};

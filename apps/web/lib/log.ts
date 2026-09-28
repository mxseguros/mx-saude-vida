/**
 * Log estruturado do servidor — uma linha JSON por evento, que a Vercel
 * indexa e filtra por campo.
 *
 * Regra que este arquivo existe para cumprir: NADA DE DADO PESSOAL NO LOG.
 * Nome de segurado, CPF, placa, e-mail, corpo de e-mail, saída do modelo —
 * nada disso entra. O que entra é o que ajuda a achar o problema: rota,
 * código do erro, id de ticket (opaco), agente, status HTTP, duração.
 *
 * `evento` é um nome estável em `area.acao` ("api.erro_500",
 * "ia.apolice_falhou", "vigia.retencao_falhou"), para dar para contar e
 * alertar por ele. Mensagem livre vai em `motivo`, curta.
 *
 * Puro no sentido que importa: só escreve em `console`, e o formato é o
 * mesmo em dev e em produção.
 */

export type NivelLog = "info" | "aviso" | "erro";

type Campos = Record<string, string | number | boolean | null | undefined>;

export function registrarLog(nivel: NivelLog, evento: string, campos: Campos = {}): void {
  const linha = JSON.stringify({
    nivel,
    evento,
    quando: new Date().toISOString(),
    ...limpar(campos),
  });

  if (nivel === "erro") console.error(linha);
  else if (nivel === "aviso") console.warn(linha);
  else console.log(linha);
}

/** Tira o que é vazio e corta texto longo: log não é lugar de corpo de resposta. */
function limpar(campos: Campos): Campos {
  const saida: Campos = {};
  for (const [chave, valor] of Object.entries(campos)) {
    if (valor === undefined || valor === null) continue;
    saida[chave] = typeof valor === "string" && valor.length > 300 ? `${valor.slice(0, 300)}…` : valor;
  }
  return saida;
}

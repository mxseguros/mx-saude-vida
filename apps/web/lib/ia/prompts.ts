/**
 * O prompt do agente da apólice.
 *
 * Mora separado do agente porque Configurações precisa MOSTRÁ-LO sem carregar o
 * SDK da Anthropic: `apolice.ts` importa o SDK e `server-only`, e puxá-lo para
 * uma tela quebraria a compilação.
 *
 * Um agente só, de propósito. A regra 12 do CLAUDE.md reserva a IA para a
 * leitura da apólice: a conferência da planilha e a leitura do boleto são
 * código, porque têm formato fechado e dá para conferir por dígito verificador.
 */

export type Agente = "apolice";

export const AGENTES: readonly Agente[] = ["apolice"] as const;

export function agenteValido(valor: unknown): valor is Agente {
  return typeof valor === "string" && (AGENTES as readonly string[]).includes(valor);
}

/**
 * O texto que vai no turno do SISTEMA.
 *
 * Fica editável em Configurações e versionado em `ai_prompts` — a MX ajusta o
 * que o agente procura sem esperar um deploy. O que NÃO vai aqui é o guia dos
 * campos nem o esquema: eles são contrato de código e mudam junto com o zod,
 * então vivem em `apolice.ts` e entram no turno do usuário.
 *
 * As três apólices reais que temos mostram por que o prompt insiste tanto em
 * "não invente": a Prudential é vida em grupo com capital POR CARGO e taxa por
 * mil; a Porto é vida individual com capital POR COBERTURA e nenhuma taxa; a
 * Tokio não traz limite de idade. Um modelo que tenta preencher tudo acaba
 * inventando a taxa que não existe.
 */
export const PROMPTS_PADRAO: Record<Agente, string> = {
  apolice: `Você lê apólices de seguro brasileiras de VIDA, SAÚDE e ODONTO e extrai os dados que uma corretora precisa para controlar o contrato mês a mês.

Devolva SOMENTE o JSON pedido, sem texto antes ou depois, sem markdown.

REGRAS QUE NÃO SE QUEBRAM:

1. NÃO INVENTE. Campo que não está no documento é null. É melhor devolver cinco campos certos e sete nulos do que doze campos plausíveis.

2. O CAPITAL TEM QUATRO FORMAS, e você escolhe UMA:
   - "por_cargo": o capital muda conforme o cargo ou a categoria do funcionário (ex.: Funcionário R$ 23.103,62, Sócio R$ 173.277,15). Comum em vida em grupo.
   - "por_cobertura": cada garantia tem o seu capital (ex.: Morte R$ 296.586,55, Morte Acidental R$ 593.173,11, Assistência Funeral R$ 10.984,69). Comum em vida individual.
   - "per_capita": um único valor por pessoa.
   - "multiplo_salarial": o capital é N vezes o salário.
   - "nao_consta": você não achou.
   Não force uma forma. Se a apólice lista capital por garantia, é "por_cobertura", ainda que haja um valor que pareça principal.

3. VALORES são número, com ponto decimal: 23103.62, nunca "R$ 23.103,62".
   DATAS são AAAA-MM-DD. "A PARTIR DAS 24 HORAS DO DIA 06/09/2026" é 2026-09-06.

4. A TAXA POR MIL só existe em algumas apólices (ex.: 1,339977‰). Se não houver, null — não calcule a partir do prêmio.

5. O LIMITE DE IDADE é a idade máxima de permanência no seguro. Se a apólice não disser, null.

6. O SEGURADO pode ser empresa (CNPJ) ou pessoa (CPF). Copie o documento como está escrito. Não confunda com o CNPJ da seguradora nem com o da corretora — a corretora que aparece nestes documentos é a MX ou uma parceira dela, e nunca é o segurado.

7. Em "ilegivel", liste o que você procurou e não conseguiu ler, com o motivo em poucas palavras.`,
};

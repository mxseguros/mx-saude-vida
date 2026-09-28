/**
 * Bloqueio na terceira senha errada (regra da operação).
 *
 * Tres senhas erradas seguidas bloqueiam o acesso, administrador inclusive;
 * so o administrador libera, redefinindo a senha em Configuracoes › Equipe.
 * A tela NAO conta tentativas ("restam 2") — decisao de 17/09: isso diria a
 * quem tenta adivinhar que o e-mail existe. Ela avisa da regra, igual para
 * qualquer e-mail, e avisa do bloqueio quando ele acontece.
 *
 * Puro: o numero mora aqui e na migration `20260917180000` (o banco e quem
 * conta, para nao depender de quem chama). Se um mudar, o outro muda junto.
 */
export const TENTATIVAS_ATE_BLOQUEAR = 3;

export const MENSAGEM_BLOQUEADO =
  "Acesso bloqueado depois de três senhas erradas. Peça ao administrador do sistema para redefinir a sua senha.";

/** A mesma frase para e-mail que existe e para e-mail que nao existe. */
export const MENSAGEM_SENHA_ERRADA =
  "E-mail ou senha incorretos. Atenção: três senhas erradas seguidas bloqueiam o acesso.";

export type FalhaRegistrada = { existe?: boolean; bloqueado?: boolean; user_id?: string } | null;

/**
 * O que dizer depois de uma senha errada. `falha` e o que o banco devolveu ao
 * contar; nulo quando a contagem nao rodou (sem chave de administracao), e ai
 * a resposta e a de sempre — contar e protecao, nao pode virar motivo para o
 * login quebrar.
 */
export function respostaDaSenhaErrada(falha: FalhaRegistrada): { mensagem: string; bloqueou: boolean } {
  if (falha?.existe && falha.bloqueado) return { mensagem: MENSAGEM_BLOQUEADO, bloqueou: true };
  return { mensagem: MENSAGEM_SENHA_ERRADA, bloqueou: false };
}

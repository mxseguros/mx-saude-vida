import type { Metadata } from "next";

import { LockupMX } from "@/componentes/marca";
import { sair } from "@/app/entrar/acoes";

/**
 * Para quem tem sessão válida e não é mais membro ativo.
 *
 * Existe porque `/entrar` não serve para este caso: o middleware chama de
 * autenticado quem tem sessão, sem olhar `profiles.active`, então mandar a
 * pessoa para o login a devolveria para cá — e o navegador acusaria
 * "redirecionamentos demais". Ela não alcançaria nem a tela de login para
 * sair. O caminho até aqui é um botão que a própria MX aperta: Configurações ›
 * Equipe › tirar acesso.
 *
 * Por isso esta página fica FORA de `(sistema)` e fora de `ROTAS_PROTEGIDAS`:
 * ela precisa abrir justamente para quem o sistema está recusando.
 *
 * A única ação é Sair, e ela é o conserto: limpa o cookie e devolve a pessoa
 * ao login em condições de entrar com outra conta.
 *
 * O texto não diz por que o acesso saiu. Pode ter sido desligamento, troca de
 * função ou engano, e nenhuma dessas é assunto de uma tela — é assunto de
 * quem administra o sistema.
 */

export const metadata: Metadata = {
  title: "Acesso encerrado",
  robots: { index: false, follow: false },
};

export default function PaginaSemAcesso() {
  return (
    <main className="grid min-h-dvh place-items-center bg-fundo px-5 py-10">
      <div className="w-full max-w-[440px]">
        <LockupMX altura={22} titulo="MX Corretora de seguros" />

        <div className="mt-6 rounded-[10px] border border-line bg-surface p-6">
          <h1 className="font-(family-name:--font-display) text-[22px] leading-tight font-[800] text-heading">
            Seu acesso está encerrado
          </h1>

          <p className="mt-3 text-[14px] leading-relaxed text-texto">
            Esta conta não está mais ativa no MX SaúdeVida. Se isso não era
            esperado, fale com quem administra o sistema na MX — só ele pode
            reativar.
          </p>
          <p className="mt-2 text-[14px] leading-relaxed text-texto">
            Se a senha foi errada três vezes seguidas, o acesso foi bloqueado:
            peça ao administrador para redefinir a sua senha.
          </p>

          <form action={sair} className="mt-5">
            <button
              type="submit"
              className="inline-flex h-10 items-center rounded-[8px] bg-accent px-4 text-[14px] font-[600] text-white hover:brightness-110"
            >
              Sair desta conta
            </button>
          </form>

          <p className="mt-3 text-[12.5px] text-muted">
            Sair limpa esta sessão do navegador e libera a tela de login — é o
            caminho para entrar com outra conta nesta máquina.
          </p>
        </div>
      </div>
    </main>
  );
}

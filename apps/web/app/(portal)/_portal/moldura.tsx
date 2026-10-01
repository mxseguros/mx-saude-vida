import Link from "next/link";

import { Avatar } from "@/componentes/ui/avatar";
import { LockupMX } from "@/componentes/marca";
import { sair } from "@/app/entrar/acoes";
import { nomeCurto } from "@/lib/dominio/cliente";
import type { ClienteLogado } from "@/lib/supabase/servidor";

import { LinkDaBarra } from "./link-da-barra";

/**
 * A moldura do portal: barra no topo, conteúdo centrado.
 *
 * Barra, e não a sidebar do sistema. São duas telas e meia — o gestor do
 * cliente entra uma vez por mês, faz uma coisa e sai. Um trilho de navegação
 * retrátil com dois itens é moldura pedindo para ser notada, quando o que
 * precisa ser notado é a pendência do mês.
 *
 * O nome da EMPRESA fica visível sempre. Quem administra mais de um CNPJ entra
 * com um login por empresa, e sem o nome na tela não há como saber em qual
 * delas a planilha está sendo enviada.
 */
export function MolduraDoPortal({
  cliente,
  children,
}: {
  cliente: ClienteLogado;
  children: React.ReactNode;
}) {
  const empresa = nomeCurto({ razaoSocial: cliente.razaoSocial, nomeFantasia: cliente.nomeFantasia });

  return (
    <div className="flex min-h-screen flex-col bg-surface-2">
      <header className="sticky top-0 z-20 bg-[var(--mx-navy)]">
        <div className="mx-auto flex max-w-[960px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 sm:px-6">
          <Link href="/portal" aria-label="Portal do cliente MX" className="shrink-0">
            <LockupMX altura={20} modo="fixo" titulo="MX Corretora de seguros" />
          </Link>

          <nav aria-label="Portal" className="order-3 flex w-full gap-1 sm:order-none sm:w-auto">
            <LinkDaBarra href="/portal">Meu painel</LinkDaBarra>
            <LinkDaBarra href="/portal/documentos">Meus documentos</LinkDaBarra>
          </nav>

          <span className="flex-1" />

          <div className="flex min-w-0 items-center gap-2.5">
            <span className="min-w-0 truncate text-[12.5px] font-[600] text-white" title={cliente.razaoSocial}>
              {empresa}
            </span>
            <Avatar iniciais={cliente.iniciais} nome={cliente.nome} />
            {/* Sair existe porque o computador do RH é compartilhado e a tela
                mostra a relação de vidas da empresa. */}
            <form action={sair}>
              <button
                type="submit"
                title="Sair"
                className="flex min-h-[32px] items-center rounded-[6px] px-2 text-[12.5px] text-[#8FA8C4] hover:text-white"
              >
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[960px] flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>

      <footer className="mx-auto w-full max-w-[960px] px-4 pb-8 sm:px-6">
        <p className="border-t border-line pt-4 text-[12px] leading-relaxed text-muted">
          MX Corretora de Seguros · seus documentos ficam nesta conta enquanto o contrato estiver ativo. Só você e a
          MX têm acesso. Nunca pedimos senha, dado bancário ou número de cartão por mensagem.
        </p>
      </footer>
    </div>
  );
}

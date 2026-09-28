import { Avatar } from "@/componentes/ui/avatar";
import { LockupMX, MonogramaMX } from "@/componentes/marca";
import { sair } from "@/app/entrar/acoes";
import { AlternadorMenu } from "./alternador-menu";
import { ProvedorMoldura } from "./contexto";
import { Icone } from "./icones";
import { LinkConfiguracoes, ListaNavegacao } from "./navegacao-lista";
import { montarMenu } from "./navegacao";
import { TopoPagina } from "./topo";
import type { Pessoa } from "@/lib/dominio/tipos";

export { TopoPagina };

/**
 * Casca do sistema: sidebar navy + area de conteudo.
 *
 * Um grupo so na navegacao — Controle mensal e Clientes. Configuracoes nao
 * entra na lista: fica ancorada no rodape, abaixo do usuario.
 *
 * RETRATIL. A largura vem de `--largura-menu`, trocada por `data-menu` no
 * <html>: 232px aberta, 56px recolhida. Recolhida ela vira TRILHO DE ICONES.
 *
 * Os itens vem de `navegacao.ts`, compartilhados com o menu do celular.
 */
export function Moldura({
  perfil,
  children,
}: {
  perfil: Pessoa;
  children: React.ReactNode;
}) {
  const grupos = montarMenu();

  return (
    <ProvedorMoldura valor={{ perfil, grupos }}>
      <div className="flex min-h-screen">
        <aside
          // A largura e a variavel; a transicao e curta e o
          // prefers-reduced-motion global ja a desliga.
          // Presa a viewport (sticky + altura da tela), com rolagem propria: os
          // itens aparecem sempre, seja o corpo curto ou longo. Antes a sidebar
          // esticava junto do conteudo e o Sair ia parar no fim da pagina.
          className="sticky top-0 hidden h-dvh w-[var(--largura-menu)] shrink-0 flex-col justify-between overflow-x-hidden overflow-y-auto bg-[var(--mx-navy)] px-2 py-5 transition-[width] duration-150 md:flex"
        >
          <div>
            <div className="mb-6 px-1">
              {/* Recolhida, o lockup nao cabe: entra o monograma. Duas marcas
                  para dois espacos, nao uma marca espremida. */}
              <div className="menu-so-aberto">
                <LockupMX altura={22} modo="fixo" titulo="MX Corretora de seguros" />
              </div>

              <span className="menu-so-recolhido">
                <MonogramaMX altura={22} modo="fixo" />
              </span>
            </div>

            <ListaNavegacao grupos={grupos} />
          </div>

          <div className="menu-rodape flex flex-col gap-3 border-t border-[rgba(202,227,247,.18)] px-1 pt-4">
            <div className="flex items-center gap-2.5">
              <Avatar iniciais={perfil.iniciais} nome={perfil.nome} />
              <div className="menu-so-aberto min-w-0">
                <p className="truncate text-[13px] font-[600] text-white">
                  {perfil.nome}
                </p>
                <p className="text-[11px] capitalize text-[#8FA8C4]">
                  {perfil.papel}
                </p>
              </div>
            </div>

            {/* So o administrador configura: usuarios e textos das mensagens
                nao sao acao de operacao diaria. */}
            {perfil.papel === "admin" ? (
              <LinkConfiguracoes>
                <Icone nome="configuracoes" tamanho={16} />
                <span className="menu-so-aberto">Configurações</span>
              </LinkConfiguracoes>
            ) : null}

            {/* Sair existe porque a maquina da corretora e compartilhada e a
                tela mostra dado de cliente. */}
            {/* Sair e Recolher na mesma linha; recolhido, empilham (CSS). */}
            <div className="menu-linha-final flex items-center gap-1">
            <form action={sair} className="min-w-0 flex-1">
              <button
                type="submit"
                title="Sair"
                className="menu-item w-full text-[12.5px] text-[#8FA8C4] hover:text-white"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" className="shrink-0">
                  <path
                    d="M6 14H3.2a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1H6M10.3 11.2 13.5 8l-3.2-3.2M13.5 8h-7"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="menu-so-aberto">Sair</span>
              </button>
            </form>
            <AlternadorMenu />
            </div>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </ProvedorMoldura>
  );
}

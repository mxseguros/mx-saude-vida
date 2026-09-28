"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icone } from "./icones";
import { rotaAtiva, type GrupoMenu } from "./navegacao";

/**
 * Os itens da sidebar, com o item ativo decidido AQUI.
 *
 * Antes cada página passava `atual="/lista"` à mão. Com a moldura no layout do
 * grupo, o layout não sabe qual rota está aberta — e passar essa string à mão
 * sempre foi um convite ao erro: a tela nova destaca o item errado e ninguém
 * repara, porque a sidebar continua aparecendo.
 *
 * O casamento é por segmento. `/clientes/novo` mantém "Clientes" destacado:
 * sem isso o cadastro ficaria sem nenhum item ativo no menu.
 */

export function ListaNavegacao({ grupos }: { grupos: GrupoMenu[] }) {
  const atual = usePathname() ?? "";

  return (
    <nav className="flex flex-col gap-4">
      {grupos.map((grupo) => (
        <div key={grupo.titulo} className="flex flex-col gap-0.5">
          <p className="menu-so-aberto px-3 pb-1.5 font-(family-name:--font-display) text-[10px] font-[700] tracking-[.13em] text-[#8A9EB8] uppercase">
            {grupo.titulo}
          </p>

          {grupo.itens.map((item) => {
            const ativo = rotaAtiva(atual, item.href);

            const conteudo = (
              <>
                <Icone nome={item.icone} />
                <span className="menu-so-aberto flex-1">{item.rotulo}</span>
                {typeof item.contagem === "number" ? (
                  // Com atencao (17/09), a contagem vira medalha vermelha: e o
                  // "voce tem coisa vencida" que antes so aparecia no Report.
                  <span
                    className={
                      "menu-contagem tabular text-[11.5px] " +
                      (item.atencao
                        ? "rounded-full bg-[var(--bad)] px-1.5 font-[700] text-white"
                        : "text-[#8FA8C4]")
                    }
                    data-atencao={item.atencao ? "1" : undefined}
                    title={`${item.contagem} em aberto${item.atencao ? ` · ${item.atencao} com prazo vencido` : ""}`}
                  >
                    {item.contagem}
                  </span>
                ) : null}
              </>
            );

            // O `title` existe para o menu recolhido, onde o rótulo some: sem
            // ele o trilho vira seis quadrados sem nome.
            const nome = `${item.rotulo}${
              typeof item.contagem === "number" ? ` · ${item.contagem} em aberto` : ""
            }${item.atencao ? ` · ${item.atencao} com prazo vencido` : ""}`;

            return ativo ? (
              <span
                key={item.href}
                aria-current="page"
                title={nome}
                className="menu-item bg-[rgba(202,227,247,.14)] text-[13.5px] font-[600] text-white"
              >
                {conteudo}
              </span>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                title={nome}
                className="menu-item text-[13.5px] text-[#A8BCD4] hover:bg-[rgba(202,227,247,.08)] hover:text-white"
              >
                {conteudo}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/**
 * O link de Configurações do rodapé.
 *
 * Fica fora dos grupos de propósito (§6.1 do protótipo: ancorado embaixo,
 * abaixo do usuário), mas precisa da mesma noção de "rota aberta" — daí morar
 * aqui e não numa terceira cópia da regra.
 */
export function LinkConfiguracoes({ children }: { children: React.ReactNode }) {
  const atual = usePathname() ?? "";

  return (
    <Link
      href="/configuracoes"
      aria-current={rotaAtiva(atual, "/configuracoes") ? "page" : undefined}
      title="Configurações"
      className="menu-item text-[12.5px] text-[#8FA8C4] hover:text-white"
    >
      {children}
    </Link>
  );
}

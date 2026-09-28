"use client";

import Link from "next/link";

import { MenuMobile } from "./menu-mobile";
import { useMoldura } from "./contexto";

/**
 * Topo da pagina: menu do celular, titulo, busca global e o CTA primario.
 *
 * No celular a sidebar some, entao o topo carrega o botao de menu, que abre a
 * navegacao inteira.
 *
 * Componente de cliente por causa do contexto da moldura; `acoes` continua
 * vindo pronto do servidor, entao a busca e os botoes de cada tela nao mudam.
 */
export function TopoPagina({
  titulo,
  contagem,
  acoes,
  voltar,
}: {
  titulo: string;
  contagem?: string;
  acoes?: React.ReactNode;
  /**
   * A saída das telas de cadastro e de conferência.
   *
   * Fica ACIMA do título: ocupa a linha inteira, tem o alvo de toque cheio e
   * lê como o que é — a volta para o contexto de onde a pessoa veio.
   */
  voltar?: { href: string; rotulo: string };
}) {
  const moldura = useMoldura();
  return (
    <header
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3 sm:gap-x-4 sm:px-6"
      // O entalhe do iPhone come o canto superior no modo paisagem.
      style={{ paddingTop: "max(.75rem, env(safe-area-inset-top))" }}
    >
      {moldura ? (
        <MenuMobile
          perfil={moldura.perfil}
          grupos={moldura.grupos}
          atual={moldura.atual}
        />
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-none">
        {voltar ? (
          <Link
            href={voltar.href}
            className="-ml-1 -mt-1 inline-flex w-fit items-center gap-1.5 rounded-[4px] py-2 pl-1 pr-2 text-[12.5px] font-[600] text-muted hover:text-heading sm:-mt-0.5 sm:py-1.5"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10 3.5 5.5 8l4.5 4.5" />
            </svg>
            {voltar.rotulo}
          </Link>
        ) : null}

        <div className="flex min-w-0 items-center gap-x-3">
          <h1 className="min-w-0 truncate text-[19px] font-[800] sm:text-[22px]">
            {titulo}
          </h1>

          {contagem ? (
            <span className="tabular text-[13px] whitespace-nowrap text-muted">
              {contagem}
            </span>
          ) : null}
        </div>
      </div>

      <div className="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
        {acoes}
      </div>
    </header>
  );
}

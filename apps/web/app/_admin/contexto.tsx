"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, type ReactNode } from "react";

import type { GrupoMenu } from "./navegacao";
import type { Pessoa } from "@/lib/dominio/tipos";

/**
 * O que a `Moldura` sabe e o `TopoPagina` precisa.
 *
 * Os dois são irmãos na árvore — toda página faz
 * `<Moldura><TopoPagina/>…</Moldura>` —, então o botão do menu no topo não
 * alcança o perfil nem os itens de navegação por prop.
 *
 * A alternativa seria repetir `perfil` e `grupos` nas sete chamadas de
 * `TopoPagina`. O contexto evita que a oitava tela esqueça de passar e apareça
 * sem menu no celular, que é o defeito que ninguém nota até estar em produção.
 */

type Moldura = {
  perfil: Pessoa;
  grupos: GrupoMenu[];
  /** A rota aberta. Vem do roteador, nao de quem monta a moldura. */
  atual: string;
};

/** O que quem monta a moldura precisa passar — o resto o provedor descobre. */
type ValorDaMoldura = Omit<Moldura, "atual">;

const ContextoMoldura = createContext<Moldura | null>(null);

export function ProvedorMoldura({
  valor,
  children,
}: {
  valor: ValorDaMoldura;
  children: ReactNode;
}) {
  // A rota vem do roteador. Antes cada pagina declarava `atual` a mao e a
  // moldura acreditava; agora nao ha como a tela nova dizer que esta noutra.
  const atual = usePathname() ?? "";

  return (
    <ContextoMoldura.Provider value={{ ...valor, atual }}>
      {children}
    </ContextoMoldura.Provider>
  );
}

/** `null` fora da moldura — o topo simplesmente não desenha o botão de menu. */
export function useMoldura(): Moldura | null {
  return useContext(ContextoMoldura);
}

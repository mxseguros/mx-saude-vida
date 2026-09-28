import type { Metadata } from "next";

import { LinkBotao } from "@/componentes/ui/botao";
import { LockupMX } from "@/componentes/marca";

export const metadata: Metadata = { title: "Página não encontrada" };

/**
 * 404.
 *
 * Sem este arquivo, endereço errado cai na página padrão do Next: fundo
 * branco, "404 | This page could not be found" em inglês, sem marca e sem
 * saída. Quem digitou errado, ou clicou num link antigo do WhatsApp, ficava
 * sem caminho de volta — e o link antigo do WhatsApp é comum aqui, porque os
 * filtros da lista viram link e a equipe manda um para o outro.
 */
export default function NaoEncontrada() {
  return (
    <main className="grid min-h-screen place-items-center px-6 py-12">
      <div className="w-full max-w-[420px]">
        <div className="mb-8 text-heading">
          <LockupMX altura={24} titulo="MX Corretora de seguros" />
        </div>

        <p className="rotulo">Erro 404</p>
        <h1 className="mt-1 text-[26px] font-[800] leading-tight">
          Esta página não existe
        </h1>
        <p className="mt-2 text-[14px] text-muted">
          O endereço pode ter mudado, ou o ticket pode ter sido excluído. Nada
          foi perdido — a esteira continua onde estava.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <LinkBotao href="/controle">Ir para o Controle</LinkBotao>
          <LinkBotao href="/lista" variante="secundario">
            Buscar um ticket
          </LinkBotao>
        </div>
      </div>
    </main>
  );
}

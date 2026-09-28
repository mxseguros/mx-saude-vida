"use client";

import { useRef, useState } from "react";

import { AbaEquipe } from "./equipe";
import { AbaMensagens } from "./mensagens";
import type { ModeloSalvo, PessoaEquipe } from "@/lib/configuracao/consulta";

/**
 * As duas abas de Configurações.
 *
 * Duas, e não seis: seguradoras e regras do mês moram no cadastro do cliente,
 * que é onde a analista já está quando pensa nelas. Configurações guarda o que
 * vale para o sistema inteiro.
 */

type Aba = "equipe" | "mensagens";

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: "equipe", rotulo: "Usuários" },
  { id: "mensagens", rotulo: "Mensagens" },
];

export function PainelConfiguracoes({
  equipe,
  modelos,
  euMesmo,
}: {
  equipe: PessoaEquipe[];
  modelos: ModeloSalvo[];
  euMesmo: string;
}) {
  const [aba, setAba] = useState<Aba>("equipe");
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);

  /**
   * Setas, Home e End andam pelas abas.
   *
   * `role="tablist"` é uma promessa ao leitor de tela: quem ouve "aba 1 de 2"
   * tenta a seta para ir à 2. Sem isto a promessa é falsa — o Tab sai da faixa
   * e cai no conteúdo, e a pessoa não tem como trocar de aba pelo teclado.
   */
  function aoTeclar(evento: React.KeyboardEvent, indice: number) {
    const teclas: Record<string, number> = {
      ArrowRight: indice + 1,
      ArrowLeft: indice - 1,
      Home: 0,
      End: ABAS.length - 1,
    };

    const destino = teclas[evento.key];
    if (destino === undefined) return;

    evento.preventDefault();
    // Dá a volta: da última para a primeira, e vice-versa.
    const alvo = (destino + ABAS.length) % ABAS.length;
    const proxima = ABAS[alvo];
    if (!proxima) return;

    setAba(proxima.id);
    botoes.current[alvo]?.focus();
  }

  return (
    <div className="flex flex-col">
      <div role="tablist" aria-label="Configurações" className="flex gap-1 border-b border-line px-4 sm:px-6">
        {ABAS.map((item, indice) => {
          const ativa = item.id === aba;
          return (
            <button
              key={item.id}
              ref={(elemento) => {
                botoes.current[indice] = elemento;
              }}
              role="tab"
              type="button"
              aria-selected={ativa}
              aria-controls={`painel-${item.id}`}
              // Foco em roda: só a aba ativa recebe Tab; entre as abas, seta.
              tabIndex={ativa ? 0 : -1}
              onKeyDown={(evento) => aoTeclar(evento, indice)}
              onClick={() => setAba(item.id)}
              className={
                "-mb-px shrink-0 border-b-2 px-3 py-2.5 text-[13.5px] font-[600] whitespace-nowrap " +
                (ativa ? "border-brand text-heading" : "border-transparent text-muted hover:text-heading")
              }
            >
              {item.rotulo}
            </button>
          );
        })}
      </div>

      <div id={`painel-${aba}`} role="tabpanel" className="px-4 py-5 sm:px-6">
        {aba === "equipe" ? <AbaEquipe equipe={equipe} euMesmo={euMesmo} /> : null}
        {aba === "mensagens" ? <AbaMensagens modelos={modelos} /> : null}
      </div>
    </div>
  );
}

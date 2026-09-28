"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Busca e abas da lista de clientes.
 *
 * Tudo vai para a URL: a analista manda o link do que está vendo, e o botão
 * voltar do navegador desfaz o filtro. Estado em `useState` faria as duas
 * coisas deixarem de funcionar sem ninguém perceber.
 *
 * A busca espera 350 ms depois da última tecla. Sem isso, cada letra vira uma
 * navegação — e a lista pisca enquanto a pessoa ainda está digitando.
 */
export function Filtros({
  termo,
  situacao,
  contagem,
}: {
  termo: string;
  situacao: "ativos" | "inativos" | "todos";
  contagem: { ativos: number; inativos: number };
}) {
  const router = useRouter();
  const consulta = useSearchParams();
  const [texto, setTexto] = useState(termo);

  // A URL manda: voltar no navegador tem que devolver o campo ao que era.
  useEffect(() => setTexto(termo), [termo]);

  useEffect(() => {
    if (texto === termo) return;

    const id = setTimeout(() => {
      const params = new URLSearchParams(consulta.toString());
      if (texto.trim()) params.set("q", texto.trim());
      else params.delete("q");
      router.replace(`/clientes?${params}`);
    }, 350);

    return () => clearTimeout(id);
  }, [texto, termo, consulta, router]);

  const abas = [
    { chave: "ativos" as const, rotulo: `Ativos · ${contagem.ativos}` },
    { chave: "inativos" as const, rotulo: `Inativos · ${contagem.inativos}` },
    { chave: "todos" as const, rotulo: "Todos" },
  ];

  function href(chave: string) {
    const params = new URLSearchParams(consulta.toString());
    if (chave === "ativos") params.delete("situacao");
    else params.set("situacao", chave);
    const busca = params.toString();
    return busca ? `/clientes?${busca}` : "/clientes";
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-[8px] border border-line-strong bg-surface px-3">
        <span aria-hidden="true" className="text-muted">
          ⌕
        </span>
        <input
          type="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Razão social, nome fantasia ou CNPJ"
          aria-label="Buscar cliente"
          // 16px no celular: abaixo disso o iPhone dá zoom no campo ao focar.
          className="h-11 w-full bg-transparent text-[16px] text-heading outline-none placeholder:text-faint sm:h-10 sm:text-[14px]"
        />
      </label>

      <div role="group" aria-label="Situação" className="flex rounded-[6px] border border-line-strong p-0.5">
        {abas.map((aba) =>
          aba.chave === situacao ? (
            <span
              key={aba.chave}
              aria-current="page"
              className="flex min-h-[34px] items-center rounded-[4px] bg-brand px-3 text-[12.5px] font-[600] text-on-brand"
            >
              {aba.rotulo}
            </span>
          ) : (
            <Link
              key={aba.chave}
              href={href(aba.chave)}
              className="flex min-h-[34px] items-center rounded-[4px] px-3 text-[12.5px] font-[600] text-muted hover:text-heading"
            >
              {aba.rotulo}
            </Link>
          ),
        )}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Avatar } from "@/componentes/ui/avatar";
import { LockupMX } from "@/componentes/marca";
import { useCamadaSobreposta } from "@/componentes/ui/foco";
import { sair } from "@/app/entrar/acoes";
import { AlternadorTema } from "./tema";
import type { GrupoMenu } from "./navegacao";
import type { Pessoa } from "@/lib/dominio/tipos";

/**
 * Menu do celular.
 *
 * A sidebar é `hidden md:flex`. Sem este menu, quem abre o sistema no telefone
 * alcança só os dois boards pelas abas do topo: Lista, Report, Clientes,
 * Configurações, o alternador de tema e o próprio usuário ficavam
 * inalcançáveis — a analista em campo, que é justamente quem está no celular,
 * não tinha como consultar a lista do lado de fora da oficina.
 *
 * Painel pela esquerda, do mesmo lado da sidebar que ele substitui: o gesto
 * de "menu" e o lugar onde a navegação mora continuam sendo o mesmo lugar.
 */
export function MenuMobile({
  perfil,
  grupos,
  atual,
}: {
  perfil: Pessoa;
  grupos: GrupoMenu[];
  atual: string;
}) {
  const [aberto, setAberto] = useState(false);
  const painel = useRef<HTMLDivElement>(null);
  const caminho = usePathname();

  const fechar = useCallback(() => setAberto(false), []);
  useCamadaSobreposta(aberto, painel, fechar);

  // Fecha ao navegar. Sem isto o painel fica por cima da tela nova e a pessoa
  // acha que o toque não funcionou — e toca de novo, agora no lugar errado.
  useEffect(() => {
    setAberto(false);
  }, [caminho]);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label="Abrir menu"
        aria-expanded={aberto}
        // 44px: é o alvo de toque mínimo. Abaixo disso o polegar erra, e o
        // erro aqui é abrir outra coisa em vez do menu.
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-[6px] border border-line-strong text-heading md:hidden"
      >
        <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true" fill="none">
          <path
            d="M1 1h16M1 7h16M1 13h16"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {aberto ? (
        <>
          <div
            aria-hidden="true"
            onClick={fechar}
            className="fixed inset-0 z-40 bg-[color-mix(in_srgb,var(--heading)_45%,transparent)] md:hidden"
          />

          <div
            ref={painel}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            tabIndex={-1}
            className={
              "fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[85vw] flex-col " +
              "justify-between overflow-y-auto bg-[var(--mx-navy)] px-4 py-5 " +
              "shadow-(--shadow-mx-3) md:hidden"
            }
            // Recuo pelo entalhe e pela barra de gestos do iPhone: sem isto o
            // "Sair" fica embaixo da barra inicial e não recebe o toque.
            style={{
              paddingTop: "max(1.25rem, env(safe-area-inset-top))",
              paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
              paddingLeft: "max(1rem, env(safe-area-inset-left))",
            }}
          >
            <div>
              <div className="mb-6 flex items-start justify-between gap-3 px-1">
                <div>
                  <LockupMX altura={22} modo="fixo" titulo="MX Corretora de seguros" />
                  <p className="mt-1.5 font-(family-name:--font-display) text-[10.5px] font-[700] uppercase tracking-[.13em] text-[var(--mx-sage)]">
                    SaúdeVida
                  </p>
                </div>

                <button
                  type="button"
                  onClick={fechar}
                  aria-label="Fechar menu"
                  className="-mt-1 -mr-1 inline-flex size-11 items-center justify-center rounded-[6px] text-[20px] leading-none text-[#8FA8C4] hover:text-white"
                >
                  &times;
                </button>
              </div>

              <nav className="flex flex-col gap-5">
                {grupos.map((grupo) => (
                  <div key={grupo.titulo} className="flex flex-col gap-0.5">
                    <p className="px-3 pb-1.5 font-(family-name:--font-display) text-[10px] font-[700] uppercase tracking-[.13em] text-[#8A9EB8]">
                      {grupo.titulo}
                    </p>

                    {grupo.itens.map((item) => {
                      const ativo = item.href === atual;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          aria-current={ativo ? "page" : undefined}
                          className={
                            "flex min-h-[44px] items-center justify-between gap-2 rounded-[6px] px-3 text-[15px] " +
                            (ativo
                              ? "bg-[rgba(202,227,247,.14)] font-[600] text-white"
                              : "text-[#A8BCD4] hover:bg-[rgba(202,227,247,.08)] hover:text-white")
                          }
                        >
                          <span>{item.rotulo}</span>
                          {typeof item.contagem === "number" ? (
                            <span
                              className={
                                "tabular text-[12.5px] " +
                                (item.atencao
                                  ? "rounded-full bg-[var(--bad)] px-2 py-0.5 font-[700] text-white"
                                  : "text-[#8FA8C4]")
                              }
                              aria-label={`${item.contagem} em aberto${item.atencao ? `, ${item.atencao} com prazo vencido` : ""}`}
                            >
                              {item.contagem}
                            </span>
                          ) : null}
                        </Link>
                      );
                    })}
                  </div>
                ))}
              </nav>
            </div>

            <div className="mt-6 flex flex-col gap-3 border-t border-[rgba(202,227,247,.18)] px-1 pt-4">
              <AlternadorTema />

              <div className="flex items-center gap-2.5">
                <Avatar iniciais={perfil.iniciais} nome={perfil.nome} />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-[600] text-white">{perfil.nome}</p>
                  <p className="text-[11px] capitalize text-[#8FA8C4]">{perfil.papel}</p>
                </div>
              </div>

              {perfil.papel === "admin" ? (
                <Link
                  href="/configuracoes"
                  aria-current={atual === "/configuracoes" ? "page" : undefined}
                  className="flex min-h-[44px] items-center px-1 text-[14px] text-[#8FA8C4] hover:text-white"
                >
                  ⚙ Configurações
                </Link>
              ) : null}

              <form action={sair}>
                <button
                  type="submit"
                  className="flex min-h-[44px] w-full items-center px-1 text-left text-[14px] text-[#8FA8C4] hover:text-white"
                >
                  Sair
                </button>
              </form>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

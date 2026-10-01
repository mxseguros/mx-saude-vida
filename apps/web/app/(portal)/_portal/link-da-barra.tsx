"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { rotaAtiva } from "@/app/_admin/navegacao";

/**
 * Um item da barra do portal, com o destaque de onde a pessoa está.
 *
 * Cliente porque precisa do caminho atual. Reusa `rotaAtiva` do menu da
 * equipe: o casamento é por SEGMENTO, então `/portal/documentos` não destaca
 * "Meu painel" e `/portal` não fica aceso dentro de `/portal/enviar`.
 */
export function LinkDaBarra({ href, children }: { href: string; children: React.ReactNode }) {
  const atual = usePathname() ?? "";
  // `/portal` casaria com tudo sob ele pela regra de prefixo: o painel é exato.
  const ativo = href === "/portal" ? atual === "/portal" : rotaAtiva(atual, href);

  return (
    <Link
      href={href}
      aria-current={ativo ? "page" : undefined}
      className={
        "flex min-h-[34px] items-center rounded-[6px] px-2.5 text-[13px] font-[600] " +
        (ativo ? "bg-[rgba(202,227,247,.16)] text-white" : "text-[#8FA8C4] hover:text-white")
      }
    >
      {children}
    </Link>
  );
}

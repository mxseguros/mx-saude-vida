import Link from "next/link";

export type Aba = "cadastro" | "funcionarios" | "movimentacoes" | "boletos";

export const ABAS: readonly Aba[] = ["cadastro", "funcionarios", "movimentacoes", "boletos"];

export function abaDe(valor: string | undefined): Aba {
  return (ABAS as readonly string[]).includes(valor ?? "") ? (valor as Aba) : "cadastro";
}

/** As abas da ficha (v0.7). Links, e não estado: a aba fica na URL e dá para mandar o link. */
export function Abas({ clienteId, atual, funcionarios }: { clienteId: string; atual: Aba; funcionarios: number }) {
  const rotulo: Record<Aba, string> = {
    cadastro: "Cadastro e apólice",
    funcionarios: `Funcionários · ${funcionarios}`,
    movimentacoes: "Movimentações",
    boletos: "Boletos",
  };
  return (
    <nav aria-label="Seções do cliente" className="flex flex-wrap gap-x-1 border-b border-line">
      {ABAS.map((aba) => (
        <Link
          key={aba}
          href={aba === "cadastro" ? `/clientes/${clienteId}` : `/clientes/${clienteId}?aba=${aba}`}
          aria-current={aba === atual ? "page" : undefined}
          className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-[13.5px] font-[600] ${
            aba === atual ? "border-brand text-heading" : "border-transparent text-muted hover:text-heading"
          }`}
        >
          {rotulo[aba]}
        </Link>
      ))}
    </nav>
  );
}

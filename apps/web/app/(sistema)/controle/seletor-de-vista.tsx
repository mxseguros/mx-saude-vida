import Link from "next/link";

/**
 * Lista · Mês · Semana.
 *
 * A vista vive na URL, não em estado de componente: assim a analista manda o
 * link da semana para a colega e ela abre no mesmo lugar, e o botão "voltar" do
 * navegador faz o que se espera.
 *
 * `scroll={false}` porque trocar de vista não é navegar para outra tela — a
 * página pular para o topo faria parecer que recarregou.
 */
export type Vista = "lista" | "mes" | "semana";

const VISTAS: { id: Vista; rotulo: string }[] = [
  { id: "lista", rotulo: "Lista" },
  { id: "mes", rotulo: "Mês" },
  { id: "semana", rotulo: "Semana" },
];

export function SeletorDeVista({ competencia, atual, busca = "" }: { competencia: string; atual: Vista; busca?: string }) {
  return (
    <div
      role="group"
      aria-label="Como ver o Controle"
      className="inline-flex overflow-hidden rounded-[8px] border border-line-strong"
    >
      {VISTAS.map((vista) => {
        const ativa = vista.id === atual;
        return (
          <Link
            key={vista.id}
            href={`/controle?mes=${competencia}&vista=${vista.id}${busca ? `&q=${encodeURIComponent(busca)}` : ""}`}
            scroll={false}
            aria-current={ativa ? "true" : undefined}
            className={
              "flex min-h-[36px] items-center border-r border-line-strong px-3 text-[12.5px] font-[600] last:border-r-0 " +
              (ativa ? "bg-brand text-on-brand" : "bg-surface text-muted hover:bg-surface-2 hover:text-heading")
            }
          >
            {vista.rotulo}
          </Link>
        );
      })}
    </div>
  );
}

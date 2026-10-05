"use client";

import { Icone, Logo } from "./primitivas";

/**
 * A página quando não há formulário a preencher.
 *
 * NUNCA um 404 seco, e é o ponto deste arquivo. Quem recebeu o link e esbarra
 * no prazo precisa saber a quem falar; quem digitou o endereço errado precisa
 * saber que foi isso. Dizer "não existe" para os dois assusta um e deixa o
 * outro sem saída — e beco sem saída, neste projeto, é defeito.
 *
 * É componente de cliente porque as primitivas são: um objeto de ícones
 * exportado de um módulo "use client" não pode ser lido por componente de
 * servidor (vira referência, não objeto).
 */
export function SemColeta({ motivo }: { motivo: "invalido" | "expirado" }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col gap-7 px-5 py-6 md:px-0 md:py-16">
      <div className="flex items-center justify-between">
        <Logo cor="navy" altura={22} />
        <span className="inline-flex items-center gap-1.5 text-[12px] text-[var(--cp-ink-2)]">
          <Icone.cadeado />
          Página segura
        </span>
      </div>

      {motivo === "invalido" ? (
        <Recado
          titulo="Este link não é válido"
          texto="Confira se o endereço veio inteiro na mensagem — links quebram quando são copiados pela metade. Se veio inteiro, peça um novo à MX."
        />
      ) : (
        <Recado
          titulo="Este link fechou"
          texto="O prazo para informar a movimentação deste mês terminou. Fale com a MX: dá para receber um link novo, e a movimentação entra na próxima fatura."
        />
      )}

      <p className="text-[12.5px] leading-[1.5] text-[var(--cp-ink-2)]">
        Esta página é da MX Corretora de Seguros. Não pedimos senha, dado bancário nem número de cartão aqui.
      </p>
    </main>
  );
}

function Recado({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div role="status" className="rounded-[14px] bg-[var(--cp-sage-soft)] px-[18px] py-4">
      <p className="m-0 text-[18px] font-[600] leading-[1.25] tracking-[-0.015em] text-[var(--cp-navy)]">{titulo}</p>
      <p className="mb-0 mt-1.5 max-w-[56ch] text-[14px] leading-[1.5] text-[var(--cp-ink)]">{texto}</p>
    </div>
  );
}

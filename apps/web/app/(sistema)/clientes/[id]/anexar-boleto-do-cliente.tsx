"use client";

import { useState } from "react";

import { AnexarBoleto } from "@/app/(sistema)/controle/anexar-boleto";
import { Selecao } from "@/componentes/ui/campo";
import { podeAgir, rotuloDaCompetencia, ROTULO_PASSO, type Passo } from "@/lib/dominio/controle";

export type MesParaBoleto = { controleId: string; competencia: string; passo: Passo };

/**
 * "Anexar boleto" na aba Boletos do cliente: escolhe o mês de referência e
 * reaproveita o mesmo anexar do Controle (lê o PDF, confere, avisa o cliente).
 *
 * Só aceita mês já conferido — é a regra da máquina de passos. Os outros
 * aparecem no seletor, desabilitados, dizendo por quê: beco sem saída é defeito.
 */
export function AnexarBoletoDoCliente({
  meses,
  cliente,
}: {
  meses: MesParaBoleto[];
  cliente: { razaoSocial: string; nomeFantasia: string | null };
}) {
  const aptos = meses.filter((m) => podeAgir(m.passo, "anexar_boleto"));
  const [escolhido, setEscolhido] = useState(aptos[0]?.controleId ?? "");

  if (!meses.length) return null;

  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-line bg-surface p-4">
      <div className="grid items-end gap-3 sm:grid-cols-[240px_auto]">
        <Selecao
          rotulo="Mês de referência"
          vazio={aptos.length ? null : "Nenhum mês pronto para boleto"}
          opcoes={meses.map((m) => ({
            valor: m.controleId,
            rotulo: podeAgir(m.passo, "anexar_boleto")
              ? rotuloDaCompetencia(m.competencia)
              : `${rotuloDaCompetencia(m.competencia)} · ${ROTULO_PASSO[m.passo].toLowerCase()}`,
          }))}
          value={escolhido}
          onChange={(e) => setEscolhido(e.target.value)}
        />
        {escolhido && aptos.some((m) => m.controleId === escolhido) ? (
          <div>
            <AnexarBoleto
              key={escolhido}
              linha={{ id: escolhido, ...cliente }}
              rotulo="Anexar boleto"
              grande
            />
          </div>
        ) : null}
      </div>
      <p className="m-0 text-[12.5px] text-muted">
        {aptos.length
          ? "O boleto entra no mês escolhido e a movimentação avança. A mensagem de boleto fica pronta em Alertas › Mensagens para enviar."
          : "O boleto entra depois que a movimentação do mês é conferida. Confira o mês na aba Movimentações."}
        {escolhido && !aptos.some((m) => m.controleId === escolhido) && aptos.length
          ? " Este mês ainda não está na etapa de boleto."
          : ""}
      </p>
    </div>
  );
}

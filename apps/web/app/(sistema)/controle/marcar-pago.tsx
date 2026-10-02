"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Botao } from "@/componentes/ui/botao";
import { Campo } from "@/componentes/ui/campo";
import { Modal } from "@/componentes/ui/modal";
import { Aviso, useAviso } from "@/componentes/ui/aviso";
import { formatarMoeda } from "@/lib/dominio/mascaras";
import { formatarData } from "@/lib/dominio/email";
import { nomeCurto } from "@/lib/dominio/cliente";
import type { LinhaDoControle } from "@/lib/controles/consulta";

/**
 * Marcar pago — fecha o mês.
 *
 * Pede confirmação em vez de fechar no clique, e mostra o valor e o vencimento
 * na janela: é a última etapa do mês, não tem como desfazer, e a linha da
 * tabela é estreita o bastante para o clique cair na errada.
 *
 * `variante` existe porque a ação aparece em dois lugares: botão principal em
 * `vencimento`, que é onde a etapa espera o pagamento, e atalho de texto em
 * `boleto`, para o cliente que paga no dia que recebe.
 */
export function MarcarPago({
  linha,
  rotulo,
  variante = "botao",
}: {
  linha: LinhaDoControle;
  rotulo: string;
  variante?: "botao" | "texto";
}) {
  const router = useRouter();
  const aviso = useAviso();

  const [aberto, setAberto] = useState(false);
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const cliente = nomeCurto({ razaoSocial: linha.razaoSocial, nomeFantasia: linha.nomeFantasia });

  async function confirmar() {
    setErro(null);
    setSalvando(true);

    try {
      const resposta = await fetch(`/api/v1/controles/${linha.id}/pago`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ observacao: observacao.trim() || null }),
      });
      const json = await resposta.json().catch(() => null);

      if (!resposta.ok) {
        setErro(json?.error?.message ?? "Não foi possível fechar o mês.");
        return;
      }

      aviso.mostrar(`${cliente} concluído. O mês fechou.`);
      setAberto(false);
      setObservacao("");
      router.refresh();
    } catch {
      setErro("Não foi possível falar com o servidor.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      {variante === "botao" ? (
        <Botao
          variante="primario"
          onClick={() => setAberto(true)}
          className="min-h-[32px] px-2.5 text-[12px] sm:min-h-[32px]"
        >
          {rotulo}
        </Botao>
      ) : (
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="text-[12px] text-muted underline underline-offset-2 hover:text-heading"
        >
          {rotulo}
        </button>
      )}

      <Modal
        aberto={aberto}
        titulo={`Fechar ${cliente}`}
        descricao="O mês passa a concluído e sai da fila. Não dá para desfazer."
        onFechar={() => setAberto(false)}
        acoes={
          <>
            <Botao variante="secundario" onClick={() => setAberto(false)} disabled={salvando}>
              Cancelar
            </Botao>
            <Botao onClick={confirmar} disabled={salvando}>
              {salvando ? "Fechando…" : "Confirmar o pagamento"}
            </Botao>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <dl className="flex flex-col rounded-[8px] bg-surface-2 px-3 py-1">
            <Linha
              rotulo="Valor do boleto"
              valor={linha.valorDoBoleto === null ? "não informado" : formatarMoeda(linha.valorDoBoleto)}
            />
            <Linha
              rotulo="Vencimento"
              valor={linha.vencimentoDoBoleto ? formatarData(linha.vencimentoDoBoleto) : formatarData(linha.datas.vencimento)}
            />
            {linha.parcelaDoBoleto ? <Linha rotulo="Parcela" valor={linha.parcelaDoBoleto} /> : null}
          </dl>

          {linha.valorDoBoleto === null ? (
            <p role="alert" className="rounded-[8px] border border-warn bg-warn-soft p-3 text-[13px] text-texto">
              Este mês não tem boleto anexado. Dá para fechar assim mesmo, mas o cliente não terá o documento em
              Meus documentos.
            </p>
          ) : null}

          <Campo
            rotulo="Observação (opcional)"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="ex.: pago com 2 dias de atraso, multa acertada"
            dica="Fica no histórico do mês."
            maxLength={300}
          />

          {erro ? (
            <p role="alert" className="text-[13px] text-bad">
              {erro}
            </p>
          ) : null}
        </div>
      </Modal>

      <Aviso estado={aviso.estado} onFechar={aviso.fechar} />
    </>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-2 last:border-0">
      <dt className="text-[13px] text-muted">{rotulo}</dt>
      <dd className="tabular text-[13.5px] font-[600] text-heading">{valor}</dd>
    </div>
  );
}

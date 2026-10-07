"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Botao } from "@/componentes/ui/botao";
import { Modal } from "@/componentes/ui/modal";
import { useAviso } from "@/componentes/ui/aviso";
import { formatarDocumento } from "@/lib/dominio/documento";

type Encontrado = { id: string; nome: string; documento: string; produto: string; jaMarcado: boolean };
type Previa = { encontrados: Encontrado[]; naoEncontrados: string[]; lidos: number };

/**
 * Marcar em lote quem faz a própria movimentação: cola a lista (pode vir da
 * planilha, com nomes), confere quem foi achado e confirma. A lista não fica
 * guardada em lugar nenhum.
 */
export function MarcarEmLote() {
  const router = useRouter();
  const aviso = useAviso();
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const aMarcar = previa?.encontrados.filter((e) => !e.jaMarcado) ?? [];

  async function enviar(corpo: unknown) {
    const resposta = await fetch("/api/v1/clientes/movimentacao-propria", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const json = await resposta.json().catch(() => null);
    if (!resposta.ok) throw new Error(json?.error?.message ?? "Não foi possível concluir.");
    return json.data;
  }

  async function conferir() {
    setOcupado(true);
    setErro(null);
    try {
      setPrevia((await enviar({ texto })) as Previa);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function marcar() {
    setOcupado(true);
    setErro(null);
    try {
      const r = (await enviar({ ids: aMarcar.map((e) => e.id) })) as { marcados: number; mesesAjustados: number };
      aviso.mostrar(
        `${r.marcados} cliente(s) marcados.${r.mesesAjustados ? ` ${r.mesesAjustados} mês(es) em aberto seguiram para o boleto.` : ""}`,
      );
      setAberto(false);
      setTexto("");
      setPrevia(null);
      router.refresh();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      <Botao variante="secundario" onClick={() => setAberto(true)}>
        Movimentação própria em lote
      </Botao>

      <Modal
        aberto={aberto}
        titulo="Clientes que fazem a própria movimentação"
        descricao="Eles informam direto na seguradora: ficam só o envio do boleto e a confirmação do pagamento."
        onFechar={() => setAberto(false)}
        largura="larga"
        acoes={
          <>
            <Botao variante="texto" onClick={() => setAberto(false)}>
              Cancelar
            </Botao>
            {previa ? (
              <Botao onClick={() => void marcar()} disabled={ocupado || !aMarcar.length}>
                {ocupado ? "Marcando…" : `Marcar ${aMarcar.length} cliente(s)`}
              </Botao>
            ) : (
              <Botao onClick={() => void conferir()} disabled={ocupado || !texto.trim()}>
                {ocupado ? "Conferindo…" : "Conferir a lista"}
              </Botao>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {previa ? (
            <>
              <p className="m-0 text-[13px] text-texto">
                {previa.lidos} documento(s) na lista · <b className="font-[600]">{previa.encontrados.length}</b> cliente(s)
                encontrados
                {previa.naoEncontrados.length ? ` · ${previa.naoEncontrados.length} não encontrados` : ""}
              </p>
              <ul className="m-0 flex max-h-[320px] list-none flex-col overflow-y-auto rounded-[8px] border border-line p-0">
                {previa.encontrados.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-line px-3 py-2 last:border-0">
                    <span className="min-w-0 break-words text-[13px] font-[600] text-heading">{e.nome}</span>
                    <span className="text-[12px] text-muted">
                      {formatarDocumento(e.documento)}
                      {e.jaMarcado ? " · já marcado" : ""}
                    </span>
                  </li>
                ))}
              </ul>
              {previa.naoEncontrados.length ? (
                <p className="m-0 text-[12.5px] text-muted">
                  Sem cadastro: {previa.naoEncontrados.map(formatarDocumento).join(", ")}. Cadastre e marque pela ficha.
                </p>
              ) : null}
              <p className="m-0 text-[12.5px] text-muted">
                Ao marcar, as datas de informar, corte e confirmar saem do cadastro, e o mês em aberto segue para o
                boleto.{" "}
                <button type="button" onClick={() => setPrevia(null)} className="font-[600] text-heading underline">
                  Voltar e editar a lista
                </button>
              </p>
            </>
          ) : (
            <label className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-[600] text-heading">Cole a lista</span>
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={10}
                placeholder="Pode colar direto da planilha: nome e CNPJ ou CPF, um por linha."
                className="w-full rounded-[6px] border border-line-strong bg-surface p-3 text-[16px] text-texto sm:text-[13px]"
              />
              <span className="text-[12.5px] text-muted">O sistema acha os CNPJs e CPFs no texto; os nomes são ignorados.</span>
            </label>
          )}
          {erro ? (
            <p role="alert" className="m-0 text-[12.5px] text-bad">
              {erro}
            </p>
          ) : null}
        </div>
      </Modal>
    </>
  );
}

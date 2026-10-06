"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Botao } from "@/componentes/ui/botao";
import { Campo } from "@/componentes/ui/campo";
import { Modal } from "@/componentes/ui/modal";
import { Aviso, useAviso } from "@/componentes/ui/aviso";
import { conferirArquivo, emMegabytes } from "@/lib/dominio/arquivo";
import { formatarMoeda, mascararMoeda } from "@/lib/dominio/mascaras";
import { nomeCurto } from "@/lib/dominio/cliente";
import type { CamposDoBoleto } from "@/lib/dominio/boleto";
import type { LinhaDoControle } from "@/lib/controles/consulta";

/**
 * Anexar boleto.
 *
 * O PDF sobe primeiro e o sistema PROPÕE parcela, valor e vencimento; a
 * analista confere e confirma. Ela nunca digita o que o sistema já leu, e o
 * sistema nunca grava o que ela não viu.
 *
 * A leitura e a gravação são duas chamadas de propósito: entre uma e outra ela
 * corrige o que estiver errado. Fazer tudo num POST só gravaria o palpite do
 * extrator, e valor errado aqui é cobrança errada ao cliente.
 */

type Anexo = { id: string; nome: string; tamanho: number };

export function AnexarBoleto({
  linha,
  rotulo,
  grande = false,
}: {
  linha: Pick<LinhaDoControle, "id" | "razaoSocial" | "nomeFantasia">;
  rotulo: string;
  /** Na aba Boletos do cliente o botão é de tamanho normal; na linha do Controle, compacto. */
  grande?: boolean;
}) {
  const router = useRouter();
  const aviso = useAviso();

  const [aberto, setAberto] = useState(false);
  const [anexo, setAnexo] = useState<Anexo | null>(null);
  const [lido, setLido] = useState<CamposDoBoleto | null>(null);
  const [lendo, setLendo] = useState(false);

  const [valor, setValor] = useState("");
  const [vencimento, setVencimento] = useState("");
  const [parcela, setParcela] = useState("");
  const [observacao, setObservacao] = useState("");

  const [erro, setErro] = useState<string | null>(null);
  const [erroCampo, setErroCampo] = useState<{ campo: string; mensagem: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  const campoDeArquivo = useRef<HTMLInputElement>(null);
  const cliente = nomeCurto({ razaoSocial: linha.razaoSocial, nomeFantasia: linha.nomeFantasia });

  function limpar() {
    setAnexo(null);
    setLido(null);
    setValor("");
    setVencimento("");
    setParcela("");
    setObservacao("");
    setErro(null);
    setErroCampo(null);
    if (campoDeArquivo.current) campoDeArquivo.current.value = "";
  }

  async function escolher(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null);

    const problema = conferirArquivo(arquivo.name, arquivo.size, arquivo.type, "boleto");
    if (problema) {
      setErro(problema.mensagem);
      return;
    }

    setLendo(true);
    try {
      const corpo = new FormData();
      corpo.append("arquivo", arquivo);

      const resposta = await fetch(`/api/v1/controles/${linha.id}/boleto`, { method: "PUT", body: corpo });
      const json = await resposta.json().catch(() => null);

      if (!resposta.ok) {
        setErro(json?.error?.message ?? "Não foi possível enviar o boleto.");
        return;
      }

      const campos = json.data.campos as CamposDoBoleto;
      setAnexo(json.data.arquivo as Anexo);
      setLido(campos);

      // Preenche o que foi lido. O que não veio fica em branco, para ela digitar
      // — campo com palpite silencioso é pior que campo vazio.
      if (campos.valor !== null) setValor(formatarMoeda(campos.valor));
      if (campos.vencimento) setVencimento(campos.vencimento);
      if (campos.parcela) setParcela(campos.parcela);
    } catch {
      setErro("Não foi possível falar com o servidor.");
    } finally {
      setLendo(false);
    }
  }

  async function salvar() {
    setErro(null);
    setErroCampo(null);
    setSalvando(true);

    try {
      const resposta = await fetch(`/api/v1/controles/${linha.id}/boleto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          arquivo: anexo?.id ?? null,
          valor,
          vencimento,
          parcela: parcela.trim() || null,
          observacao: observacao.trim() || null,
        }),
      });
      const json = await resposta.json().catch(() => null);

      if (!resposta.ok) {
        if (json?.error?.field) {
          setErroCampo({ campo: json.error.field, mensagem: json.error.message });
        }
        setErro(json?.error?.message ?? "Não foi possível salvar o boleto.");
        return;
      }

      const envio = json?.data?.envio as { email: boolean; whatsapp: boolean; aviso: string | null } | undefined;
      aviso.mostrar(
        envio?.aviso ??
          (envio?.email
            ? `Boleto de ${cliente} anexado e enviado por e-mail, com o PDF em anexo.`
            : `Boleto de ${cliente} anexado.`),
      );
      setAberto(false);
      limpar();
      router.refresh();
    } catch {
      setErro("Não foi possível falar com o servidor.");
    } finally {
      setSalvando(false);
    }
  }

  const pronto = Boolean(anexo) && Boolean(valor.trim()) && /^\d{4}-\d{2}-\d{2}$/.test(vencimento);

  return (
    <>
      <Botao
        variante="secundario"
        onClick={() => {
          limpar();
          setAberto(true);
        }}
        className={grande ? "" : "min-h-[32px] px-2.5 text-[12px] sm:min-h-[32px]"}
      >
        {rotulo}
      </Botao>

      <Modal
        aberto={aberto}
        titulo={`Anexar boleto · ${cliente}`}
        descricao="O sistema lê parcela, valor e vencimento do PDF. Confira antes de salvar."
        onFechar={() => setAberto(false)}
        largura="larga"
        acoes={
          <>
            <Botao variante="secundario" onClick={() => setAberto(false)} disabled={salvando}>
              Cancelar
            </Botao>
            <Botao onClick={salvar} disabled={salvando || !pronto}>
              {salvando ? "Salvando…" : "Salvar e avisar o cliente"}
            </Botao>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <input
            ref={campoDeArquivo}
            type="file"
            accept=".pdf"
            className="sr-only"
            onChange={(e) => void escolher(e.target.files?.[0])}
          />

          {lendo ? (
            <p className="rounded-[10px] border border-line bg-surface-2 p-4 text-[13.5px] text-texto">
              Enviando e lendo o PDF…
            </p>
          ) : anexo ? (
            <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-line bg-surface-2 p-3.5">
              <span
                aria-hidden="true"
                className="flex h-9 w-11 shrink-0 items-center justify-center rounded-[6px] bg-bad-soft text-[10.5px] font-[700] text-bad"
              >
                PDF
              </span>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[13.5px] font-[600] text-heading">{anexo.nome}</b>
                <span className="text-[12px] text-muted">{emMegabytes(anexo.tamanho)} · anexado</span>
              </span>
              <Botao variante="texto" onClick={() => campoDeArquivo.current?.click()}>
                Trocar
              </Botao>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => campoDeArquivo.current?.click()}
              className="flex min-h-[104px] w-full flex-col items-center justify-center gap-1 rounded-[10px] border-2 border-dashed border-line-strong bg-surface-2 px-4 py-6 text-center hover:border-brand"
            >
              <b className="font-(family-name:--font-display) text-[14.5px] font-[700] text-heading">
                Clique para anexar o PDF do boleto
              </b>
              <span className="text-[12.5px] text-muted">
                Parcela, valor e vencimento são lidos do arquivo
              </span>
            </button>
          )}

          {/* O que o sistema entendeu, e o quanto ele confia. Avisar é o que
              diferencia "confira" de "assine aqui". */}
          {lido && lido.avisos.length ? (
            <div
              role="alert"
              className={
                "rounded-[8px] border p-3 text-[13px] leading-relaxed " +
                (lido.confianca === "nenhuma"
                  ? "border-line bg-surface-2 text-texto"
                  : "border-warn bg-warn-soft text-texto")
              }
            >
              <ul className="flex list-none flex-col gap-1">
                {lido.avisos.map((texto) => (
                  <li key={texto}>{texto}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {lido?.confianca === "alta" ? (
            <p className="rounded-[8px] bg-ok-soft px-3 py-2.5 text-[12.5px] leading-relaxed text-ok">
              Lido da linha digitável, e o texto do boleto confirma. Confira e salve.
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <Campo
              rotulo="Parcela"
              value={parcela}
              onChange={(e) => setParcela(e.target.value.replace(/\D/g, "").slice(0, 3))}
              inputMode="numeric"
              placeholder="44"
              destacado={Boolean(lido?.parcela)}
            />
            <Campo
              rotulo="Valor"
              required
              mascara={mascararMoeda}
              value={valor}
              onChange={(e) => {
                setValor(e.target.value);
                setErroCampo(null);
              }}
              erro={erroCampo?.campo === "valor" ? erroCampo.mensagem : null}
              inputMode="numeric"
              placeholder="R$ 0,00"
              destacado={lido?.valor !== null && lido?.valor !== undefined}
            />
            <Campo
              rotulo="Vencimento"
              required
              type="date"
              value={vencimento}
              onChange={(e) => {
                setVencimento(e.target.value);
                setErroCampo(null);
              }}
              erro={erroCampo?.campo === "vencimento" ? erroCampo.mensagem : null}
              destacado={Boolean(lido?.vencimento)}
            />
          </div>

          <Campo
            rotulo="Observação (opcional)"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="ex.: boleto reemitido pela seguradora"
            dica="Fica no histórico do mês."
            maxLength={300}
          />

          {erro && !erroCampo ? (
            <p role="alert" className="text-[13px] text-bad">
              {erro}
            </p>
          ) : null}

          <p className="rounded-[8px] bg-surface-2 px-3 py-2.5 text-[12.5px] leading-relaxed text-texto">
            Ao salvar, o boleto fica na aba Boletos do cliente e a movimentação avança. A mensagem de boleto
            sai na hora pelo canal dele: por e-mail, com o PDF em anexo; por WhatsApp, fica pronta para você abrir
            no botão da linha.
          </p>

          <Aviso estado={aviso.estado} onFechar={aviso.fechar} />
        </div>
      </Modal>
    </>
  );
}

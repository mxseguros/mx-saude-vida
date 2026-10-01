"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Botao } from "@/componentes/ui/botao";
import { Campo } from "@/componentes/ui/campo";
import { Stepper, type EtapaDoStepper } from "@/componentes/ui/stepper";
import { conferirArquivo, emMegabytes } from "@/lib/dominio/arquivo";
import { marcosDepoisDoEnvio } from "@/lib/dominio/portal";
import { nomeDoMes, type DatasDoMes } from "@/lib/dominio/controle";
import { mascararTelefone } from "@/lib/dominio/mascaras";

import { confirmarEnvio, enviarPlanilhaComProgresso } from "./enviar";

/**
 * Enviar a planilha, em três etapas.
 *
 * Três e não cinco: o cliente não informa mais entrada e saída de funcionário
 * (decisão de 28/09) — ele manda o arquivo que já usa. Sobrou Dados, Planilha e
 * Revisão, e a primeira é só confirmação do que a MX já tem.
 *
 * O arquivo sobe na ETAPA 2, antes da revisão, e o mês só anda no botão final.
 * Isso permite trocar o anexo depois de ver que era o errado — e evita o mês
 * avançar porque alguém fechou a aba no meio.
 */

const ETAPAS: readonly EtapaDoStepper[] = [
  { chave: "dados", rotulo: "Dados" },
  { chave: "planilha", rotulo: "Planilha" },
  { chave: "revisao", rotulo: "Revisão", curto: "Revisar" },
];

const TITULOS = [
  { titulo: "Confira se está tudo certo", apoio: "Preenchemos com o que a MX já tem. Se algo mudou, fale com a gente." },
  {
    titulo: "A planilha do mês",
    apoio: "Envie o arquivo que você já usa. Se não houve mudanças, é só marcar abaixo.",
  },
  { titulo: "Tudo pronto para enviar", apoio: "Revise rapidamente. Depois do envio, a MX confere e avisa você." },
];

type Anexo = { id: string; nome: string; tamanho: number };

export function WizardDeEnvio({
  controleId,
  competencia,
  datas,
  empresa,
  documento,
  gestor,
  celular,
}: {
  controleId: string;
  competencia: string;
  datas: DatasDoMes;
  empresa: string;
  documento: string;
  gestor: string;
  celular: string | null;
}) {
  const router = useRouter();

  const [etapa, setEtapa] = useState(0);
  const [observacao, setObservacao] = useState("");
  const [anexo, setAnexo] = useState<Anexo | null>(null);
  const [semMudancas, setSemMudancas] = useState(false);
  const [progresso, setProgresso] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [recomecar, setRecomecar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [protocolo, setProtocolo] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  const campoDeArquivo = useRef<HTMLInputElement>(null);
  const mes = nomeDoMes(competencia);

  async function escolherArquivo(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null);

    // A mesma conferência do servidor, antes de gastar a conexão de quem está no
    // 4G subindo 20 MB para ouvir que o formato não serve.
    const problema = conferirArquivo(arquivo.name, arquivo.size, arquivo.type, "planilha");
    if (problema) {
      setErro(problema.mensagem);
      return;
    }

    setSemMudancas(false);
    setProgresso(0);

    const resposta = await enviarPlanilhaComProgresso(controleId, arquivo, setProgresso);
    setProgresso(null);

    if (!resposta.ok) {
      setErro(resposta.mensagem);
      return;
    }

    setAnexo({ id: resposta.arquivo.id, nome: resposta.arquivo.nome, tamanho: resposta.arquivo.tamanho });
  }

  function trocarArquivo() {
    setAnexo(null);
    setErro(null);
    // O input guarda o arquivo anterior: sem limpar, escolher o MESMO arquivo de
    // novo não disparia `change` e a tela ficaria parada.
    if (campoDeArquivo.current) campoDeArquivo.current.value = "";
  }

  function marcarSemMudancas() {
    setErro(null);
    setSemMudancas((antes) => !antes);
    // Marcar "sem mudanças" com um anexo pendurado é o envio ambíguo que a rota
    // recusa; aqui o anexo sai na hora, para a contradição não chegar lá.
    if (!semMudancas) setAnexo(null);
  }

  async function enviar() {
    setErro(null);
    setEnviando(true);

    const resposta = await confirmarEnvio({
      controle: controleId,
      arquivo: anexo?.id ?? null,
      observacao: observacao.trim() || null,
      semMudancas,
    });

    setEnviando(false);

    if (!resposta.ok) {
      setErro(resposta.mensagem);
      setRecomecar(Boolean(resposta.recomeçar));
      return;
    }

    setProtocolo(resposta.protocolo);
    setEnviado(true);
    // O painel e Meus documentos precisam refletir o novo passo quando a pessoa
    // sair daqui.
    router.refresh();
  }

  /* ---------------------------------------------------------------- sucesso */
  if (enviado) {
    const marcos = marcosDepoisDoEnvio(datas, competencia);

    return (
      <div className="rounded-[12px] border border-line bg-surface p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ok-soft text-[18px] font-[700] text-ok"
          >
            ✓
          </span>
          <div>
            <h2 className="font-(family-name:--font-display) text-[18px] font-[800] text-heading">
              Recebemos, {gestor.split(/\s+/)[0]}.
            </h2>
            <p className="text-[13.5px] text-muted">Daqui a MX cuida. Pode guardar o celular.</p>
          </div>
        </div>

        {/* O que vem depois, em datas. Sem isto a tela de "enviado" é um beco, e
            a dúvida "e agora?" vira ligação para a analista. */}
        <ol className="mt-5 flex list-none flex-col gap-0">
          {marcos.map((marco, i) => (
            <li key={marco.quando} className="flex gap-3">
              <span className="flex flex-col items-center" aria-hidden="true">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${i === 0 ? "bg-brand" : "bg-surface-3"}`} />
                {i < marcos.length - 1 ? <span className="w-px flex-1 bg-line" /> : null}
              </span>
              <span className="pb-4">
                <b className="block font-(family-name:--font-display) text-[13px] font-[700] text-heading">
                  {marco.quando}
                </b>
                <span className="block text-[13px] leading-relaxed text-muted">{marco.o_que}</span>
              </span>
            </li>
          ))}
        </ol>

        {protocolo ? (
          <p className="flex items-center gap-2 rounded-[8px] bg-surface-2 px-3 py-2.5 text-[13px]">
            <span className="text-muted">Protocolo</span>
            <b className="tabular font-[700] text-heading">{protocolo}</b>
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <Botao variante="secundario" onClick={() => router.push("/portal/documentos")}>
            Ver em Meus documentos
          </Botao>
          <span className="flex-1" />
          <Botao variante="texto" onClick={() => router.push("/portal")}>
            Voltar ao painel
          </Botao>
        </div>
      </div>
    );
  }

  /* ----------------------------------------------------------------- etapas */
  const ultima = etapa === ETAPAS.length - 1;
  const temEnvio = Boolean(anexo) || semMudancas;

  return (
    <div className="rounded-[12px] border border-line bg-surface p-4 sm:p-6">
      <Stepper etapas={ETAPAS} atual={etapa} onIr={setEtapa} rotulo="Etapas do envio" />

      <header className="mt-5">
        <p className="font-(family-name:--font-display) text-[11px] font-[700] uppercase tracking-[.06em] text-faint">
          Etapa {etapa + 1} de {ETAPAS.length}
        </p>
        <h2 className="mt-1 font-(family-name:--font-display) text-[17px] font-[800] text-heading">
          {TITULOS[etapa]?.titulo}
        </h2>
        <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{TITULOS[etapa]?.apoio}</p>
      </header>

      <div className="mt-5 flex flex-col gap-4">
        {etapa === 0 ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Leitura rotulo="Empresa" valor={empresa} />
              <Leitura rotulo="CNPJ" valor={documento} />
              <Leitura rotulo="Seu nome" valor={gestor} />
              <Leitura
                rotulo="Celular"
                valor={celular ? mascararTelefone(celular) : "não cadastrado"}
                apoio="Para onde a MX confirma o recebimento."
              />
            </div>

            <Campo
              rotulo="Observação para a MX (opcional)"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="ex.: entrou a Mariana em 01/09"
              dica="Qualquer coisa que ajude quem vai conferir."
              maxLength={500}
            />
          </>
        ) : null}

        {etapa === 1 ? (
          <>
            <input
              ref={campoDeArquivo}
              type="file"
              accept=".xlsx,.xls,.csv,.pdf"
              className="sr-only"
              onChange={(e) => void escolherArquivo(e.target.files?.[0])}
            />

            {progresso !== null ? (
              <div className="rounded-[10px] border border-line bg-surface-2 p-4">
                <p className="text-[13.5px] font-[600] text-heading">Enviando… {progresso}%</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-[2px] bg-surface-3" aria-hidden="true">
                  <div
                    className="h-full rounded-[2px] bg-brand transition-[width] duration-200"
                    style={{ width: `${progresso}%` }}
                  />
                </div>
                <p className="mt-2 text-[12px] text-muted">Não feche esta página até terminar.</p>
              </div>
            ) : anexo ? (
              <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-line bg-surface-2 p-3.5">
                <span
                  aria-hidden="true"
                  className="flex h-9 w-11 shrink-0 items-center justify-center rounded-[6px] bg-ok-soft text-[10.5px] font-[700] text-ok"
                >
                  XLS
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[13.5px] font-[600] text-heading">{anexo.nome}</b>
                  <span className="text-[12px] text-muted">{emMegabytes(anexo.tamanho)} · enviado</span>
                </span>
                <Botao variante="texto" onClick={trocarArquivo}>
                  Trocar
                </Botao>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => campoDeArquivo.current?.click()}
                className="flex min-h-[112px] w-full flex-col items-center justify-center gap-1 rounded-[10px] border-2 border-dashed border-line-strong bg-surface-2 px-4 py-6 text-center hover:border-brand"
              >
                <b className="font-(family-name:--font-display) text-[14.5px] font-[700] text-heading">
                  Toque para enviar a planilha
                </b>
                <span className="text-[12.5px] text-muted">xlsx, xls, csv ou PDF · a que você já usa</span>
              </button>
            )}

            <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
              <Botao
                variante={semMudancas ? "primario" : "secundario"}
                onClick={marcarSemMudancas}
                aria-pressed={semMudancas}
                disabled={progresso !== null}
              >
                {semMudancas ? "✓ " : ""}Não houve mudanças em {mes}
              </Botao>
              <span className="text-[12.5px] leading-relaxed text-muted">
                Ninguém entrou nem saiu? Marque aqui e pule o arquivo.
              </span>
            </div>
          </>
        ) : null}

        {etapa === 2 ? (
          <>
            <dl className="flex flex-col">
              <Revisao rotulo="Empresa" valor={`${empresa} · ${documento}`} />
              <Revisao rotulo="Quem envia" valor={gestor} />
              <Revisao
                rotulo="Planilha"
                valor={
                  semMudancas
                    ? `Sem mudanças em ${mes}`
                    : anexo
                      ? `${anexo.nome} · ${emMegabytes(anexo.tamanho)}`
                      : "não enviada"
                }
                problema={!temEnvio}
                onCorrigir={() => setEtapa(1)}
              />
              <Revisao rotulo="Observação" valor={observacao.trim() || "—"} onCorrigir={() => setEtapa(0)} />
            </dl>

            <p className="flex gap-2.5 rounded-[8px] bg-surface-2 p-3 text-[12.5px] leading-relaxed text-texto">
              <span aria-hidden="true">🔒</span>
              <span>
                Estes dados ficam com a MX Corretora de Seguros e são usados só no seguro da sua empresa. Não pedimos
                senha, dado bancário nem número de cartão nesta página.
              </span>
            </p>
          </>
        ) : null}

        {erro ? (
          <div role="alert" className="rounded-[8px] border border-warn bg-warn-soft p-3 text-[13px] text-texto">
            <p>{erro}</p>
            {recomecar ? (
              <button
                type="button"
                onClick={() => router.refresh()}
                className="mt-1.5 font-[600] text-heading underline underline-offset-2"
              >
                Atualizar a página
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
        {etapa > 0 ? (
          <Botao variante="secundario" onClick={() => setEtapa(etapa - 1)} disabled={enviando}>
            ← Voltar
          </Botao>
        ) : (
          <span className="text-[12.5px] text-muted">Leva 2 minutos.</span>
        )}

        <span className="flex-1" />

        {ultima ? (
          <Botao onClick={enviar} disabled={enviando || !temEnvio}>
            {enviando ? "Enviando…" : "Enviar para MX"}
          </Botao>
        ) : (
          <Botao onClick={() => setEtapa(etapa + 1)} disabled={progresso !== null}>
            Continuar →
          </Botao>
        )}
      </div>
    </div>
  );
}

/** Campo que a MX preenche e o cliente não edita: texto, não input desabilitado. */
function Leitura({ rotulo, valor, apoio }: { rotulo: string; valor: string; apoio?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-(family-name:--font-display) text-[12.5px] font-[600] text-heading">{rotulo}</span>
      <span className="rounded-[8px] bg-surface-2 px-3 py-2.5 text-[14px] text-texto">{valor}</span>
      {apoio ? <span className="text-[12px] text-muted">{apoio}</span> : null}
    </div>
  );
}

function Revisao({
  rotulo,
  valor,
  problema = false,
  onCorrigir,
}: {
  rotulo: string;
  valor: string;
  problema?: boolean;
  onCorrigir?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line py-2.5 last:border-0">
      <dt className="w-[108px] shrink-0 text-[13px] text-muted">{rotulo}</dt>
      <dd className={`min-w-0 flex-1 text-[13.5px] ${problema ? "font-[600] text-bad" : "text-heading"}`}>{valor}</dd>
      {onCorrigir ? (
        <button
          type="button"
          onClick={onCorrigir}
          className="text-[12.5px] text-muted underline underline-offset-2 hover:text-heading"
        >
          {problema ? "anexar" : "alterar"}
        </button>
      ) : null}
    </div>
  );
}

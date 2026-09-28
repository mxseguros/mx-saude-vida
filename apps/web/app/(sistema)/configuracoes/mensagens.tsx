"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Botao } from "@/componentes/ui/botao";
import { Campo, Selecao } from "@/componentes/ui/campo";
import { Aviso, useAviso } from "@/componentes/ui/aviso";
import {
  montarMensagem,
  QUANDO_SAI,
  ROTULO_CANAL,
  ROTULO_MODELO,
  VARIAVEIS_DA_MENSAGEM,
  variaveisComUmaChaveSo,
  variaveisInvalidas,
  type Canal,
} from "@/lib/dominio/mensagem";
import { CANAIS } from "@/lib/dominio/cliente";
import type { ModeloSalvo } from "@/lib/configuracao/consulta";

/**
 * Mensagens.
 *
 * Os cinco textos que o cliente recebe. É a tela que mais muda de conteúdo e a
 * que menos deveria mudar de código: mexer na palavra "corte" não pode exigir
 * deploy.
 *
 * A prévia usa um cliente de exemplo e fica ao lado do texto, atualizando a
 * cada tecla. Sem ela, o administrador só descobriria que `{data_corte}` estava
 * fora de lugar quando a mensagem chegasse ao celular do gestor.
 */

/**
 * O cliente de exemplo da prévia.
 *
 * Inventado, e precisa continuar sendo: este repositório é público, e um nome
 * de cliente de verdade aqui viraria commit permanente.
 */
const EXEMPLO = {
  cliente: "Indústria Modelo",
  gestor: "Ana Paula Ribeiro",
  competencia: "2026-10",
  data: "2026-10-08",
  dataCorte: "2026-10-10",
  dataBoleto: "2026-10-16",
  dataVencimento: "2026-10-30",
  valorDoBoleto: 6184.67,
  link: "https://saudevida-mx.vercel.app/portal",
  seguradora: "Seguradora Exemplo",
  analista: "Equipe MX",
  motivo: "faltou a data de admissão de dois funcionários",
};

/**
 * A lista dos cinco modelos e a escolha de qual editar.
 *
 * O editor é um componente separado, com `key` no modelo: trocar de aba
 * DESTRÓI o rascunho junto. Guardar o rascunho aqui faria o texto do boleto
 * reaparecer dentro do modelo de vencimento — e, pior, salvar no lugar errado.
 */
export function AbaMensagens({ modelos }: { modelos: ModeloSalvo[] }) {
  const [indice, setIndice] = useState(0);
  const atual = modelos[indice];

  if (!atual) {
    return (
      <p role="alert" className="rounded-[8px] border border-warn bg-warn-soft p-3 text-[13.5px] text-texto">
        Nenhum modelo de mensagem cadastrado. Rode o seed do banco — sem os cinco modelos, o Controle não
        consegue enviar nada.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Os cinco modelos na ordem do mês: quem procura "a mensagem do boleto"
          acha pela posição, sem ler os cinco rótulos. */}
      <div className="flex flex-wrap gap-2">
        {modelos.map((m, i) => {
          const ativo = i === indice;
          return (
            <button
              key={m.modelo}
              type="button"
              onClick={() => setIndice(i)}
              aria-current={ativo}
              className={
                "flex min-w-[140px] flex-1 flex-col gap-0.5 rounded-[10px] border px-3.5 py-2.5 text-left " +
                (ativo ? "border-brand bg-accent-soft" : "border-line bg-surface hover:border-line-strong")
              }
            >
              <span className="font-(family-name:--font-display) text-[13.5px] font-[700] text-heading">
                {ROTULO_MODELO[m.modelo]}
              </span>
              <span className="text-[11.5px] leading-tight text-muted">Sai {QUANDO_SAI[m.modelo]}</span>
            </button>
          );
        })}
      </div>

      <EditorDeModelo key={atual.modelo} salvo={atual} />
    </div>
  );
}

function EditorDeModelo({ salvo }: { salvo: ModeloSalvo }) {
  const router = useRouter();
  const aviso = useAviso();

  const [assunto, setAssunto] = useState(salvo.assunto);
  const [corpo, setCorpo] = useState(salvo.corpo);
  const [canal, setCanal] = useState<Canal>(salvo.canalPadrao);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const previa = useMemo(() => montarMensagem(corpo, EXEMPLO), [corpo]);
  const desconhecidas = useMemo(() => variaveisInvalidas(corpo), [corpo]);
  const umaChaveSo = useMemo(() => variaveisComUmaChaveSo(corpo), [corpo]);

  const mudou = assunto !== salvo.assunto || corpo !== salvo.corpo || canal !== salvo.canalPadrao;

  /** Insere `{variavel}` onde o cursor está, em vez de obrigar a digitar. */
  function inserir(variavel: string) {
    setErro(null);
    const area = document.getElementById("corpo-da-mensagem") as HTMLTextAreaElement | null;
    const marca = `{{${variavel}}}`;

    if (!area) {
      setCorpo(`${corpo}${marca}`);
      return;
    }

    const inicio = area.selectionStart;
    const fim = area.selectionEnd;
    setCorpo(corpo.slice(0, inicio) + marca + corpo.slice(fim));

    // O cursor vai para depois da variável inserida — senão a próxima digitação
    // cairia no começo do texto.
    requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(inicio + marca.length, inicio + marca.length);
    });
  }

  async function salvar() {
    setErro(null);

    if (desconhecidas.length) {
      setErro(
        `O sistema não conhece ${desconhecidas.map((v) => `{{${v}}}`).join(", ")}. Corrija antes de salvar — sem tradução, isso sai literal para o cliente.`,
      );
      return;
    }
    setOcupado(true);

    try {
      const resposta = await fetch(`/api/v1/configuracao/mensagens/${salvo.modelo}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assunto, texto: corpo, canalPadrao: canal }),
      });
      const resposta_json = await resposta.json().catch(() => null);

      if (!resposta.ok) {
        setErro(resposta_json?.error?.message ?? "Não foi possível salvar o modelo.");
        return;
      }

      aviso.mostrar(`Mensagem de ${ROTULO_MODELO[salvo.modelo].toLowerCase()} salva.`);
      // `refresh` traz o texto novo do servidor; o estado local já é ele.
      router.refresh();
    } catch {
      setErro("Não foi possível falar com o servidor.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        <div className="flex flex-col gap-3">
          <Selecao
            rotulo="Canal sugerido"
            vazio={null}
            opcoes={CANAIS.map((c) => ({ valor: c, rotulo: ROTULO_CANAL[c] }))}
            value={canal}
            onChange={(e) => {
              setErro(null);
              setCanal(e.target.value as Canal);
            }}
            dica="Sugestão para quem cadastra cliente novo. O canal que vale é o do cadastro de cada um."
          />

          <Campo
            rotulo="Assunto do e-mail"
            value={assunto}
            onChange={(e) => {
              setErro(null);
              setAssunto(e.target.value);
            }}
            dica="Só o e-mail usa. O WhatsApp manda o texto direto."
          />

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="corpo-da-mensagem"
              className="font-(family-name:--font-display) text-[12.5px] font-[600] text-heading"
            >
              Mensagem
            </label>
            <textarea
              id="corpo-da-mensagem"
              value={corpo}
              onChange={(e) => {
                setErro(null);
                setCorpo(e.target.value);
              }}
              rows={12}
              className="w-full rounded-[8px] border border-line-strong bg-surface px-3 py-2.5 text-[14px] leading-relaxed text-heading outline-none focus:border-brand"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="font-(family-name:--font-display) text-[11px] font-[700] uppercase tracking-[.06em] text-faint">
              Clique para inserir
            </span>
            <div className="flex flex-wrap gap-1.5">
              {VARIAVEIS_DA_MENSAGEM.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => inserir(v)}
                  className="tabular rounded-[5px] border border-line bg-surface-2 px-2 py-1 text-[11.5px] text-muted hover:border-brand hover:text-heading"
                >
                  {`{{${v}}}`}
                </button>
              ))}
            </div>
          </div>

          {desconhecidas.length ? (
            <p role="alert" className="rounded-[8px] border border-warn bg-warn-soft p-3 text-[13px] text-texto">
              {desconhecidas.map((v) => `{{${v}}}`).join(", ")} não existe. Do jeito que está, isso sai literal na
              mensagem do cliente.
            </p>
          ) : null}

          {umaChaveSo.length ? (
            <p role="alert" className="rounded-[8px] border border-warn bg-warn-soft p-3 text-[13px] text-texto">
              {umaChaveSo.map((v) => `{${v}}`).join(", ")} está com UMA chave só. O sistema troca{" "}
              {umaChaveSo.map((v) => `{{${v}}}`).join(", ")} — do jeito que está, sai escrito assim mesmo na
              mensagem.
            </p>
          ) : null}

          {erro ? (
            <p role="alert" className="text-[13px] text-bad">
              {erro}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Botao onClick={salvar} disabled={ocupado || !mudou || !corpo.trim()}>
              {ocupado ? "Salvando…" : "Salvar mensagem"}
            </Botao>
            {mudou ? (
              <Botao
                variante="secundario"
                onClick={() => {
                  setAssunto(salvo.assunto);
                  setCorpo(salvo.corpo);
                  setCanal(salvo.canalPadrao);
                  setErro(null);
                }}
                disabled={ocupado}
              >
                Descartar
              </Botao>
            ) : null}
            <span className="text-[12px] text-muted">
              {salvo.atualizadoPor
                ? `Última alteração por ${salvo.atualizadoPor}, em ${new Date(salvo.atualizadoEm).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`
                : "Texto original do sistema."}
            </span>
          </div>
        </div>

        {/* A prévia com dados de exemplo, colada no texto: é a única forma de
            ver que faltou um espaço ou que a data caiu no lugar errado. */}
        <aside className="flex h-fit flex-col gap-2 rounded-[10px] border border-line bg-surface-2 p-3.5 lg:sticky lg:top-4">
          <span className="font-(family-name:--font-display) text-[11px] font-[700] uppercase tracking-[.06em] text-faint">
            Como o cliente vê
          </span>
          <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-texto">
            {previa || <span className="text-faint">A mensagem está vazia.</span>}
          </p>
          <p className="border-t border-line pt-2 text-[11.5px] leading-relaxed text-muted">
            Exemplo com {EXEMPLO.cliente}, competência outubro. Os dados de cada cliente entram na hora do envio.
          </p>
        </aside>
      </div>

      <Aviso estado={aviso.estado} onFechar={aviso.fechar} />
    </div>
  );
}

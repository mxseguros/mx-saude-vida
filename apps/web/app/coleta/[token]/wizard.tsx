"use client";

import { useRef, useState } from "react";

import type { ColetaPublica } from "@/lib/coleta/consulta";
import { esquemaColeta } from "@/lib/dominio/coleta";
import { mascararDocumento, mascararTelefone } from "@/lib/dominio/mascaras";
import { porCampo, validar } from "@/lib/dominio/validar";

import { enviarColeta, enviarPlanilhaComProgresso } from "./enviar";
import {
  ETAPAS,
  EtapaDados,
  EtapaPessoas,
  EtapaPlanilha,
  EtapaRevisao,
  mesEmPalavras,
  Recebido,
  type Erros,
  type Pessoa,
  type Planilha,
} from "./etapas";
import { Aviso, Btn, Icone, Logo, Pilulas, Progresso } from "./primitivas";

/**
 * As cinco etapas, e o estado que atravessa as cinco.
 *
 * O estado é todo do React e nada é salvo no meio do caminho. Não há rascunho
 * de propósito: um rascunho guardaria CPF de funcionário no banco antes de o
 * gestor decidir enviar, e ele pode simplesmente fechar a aba — e aí a MX
 * ficaria com dado pessoal de um envio que ninguém autorizou. O preço é que
 * recarregar a página perde o que foi digitado, e o formulário é curto o
 * bastante para esse preço ser o menor dos dois.
 *
 * A validação é o MESMO esquema zod da rota (regra 3). Aqui ela serve para o
 * erro aparecer antes do envio; a que vale é a do servidor, e os erros dele
 * entram no mesmo mapa por campo, então as duas pintam a tela igual.
 */

/** Os campos de cada etapa, para o "Continuar" só cobrar o que está na tela. */
const CAMPOS_DA_ETAPA: readonly (readonly string[])[] = [
  ["nome", "celular", "setor"],
  ["entradas"],
  ["saidas"],
  ["planilhaId"],
  // A revisão responde por tudo, inclusive pelas regras que olham o
  // formulário inteiro ("alguma coisa tem de chegar").
  [],
];

const VAZIA: Pessoa = { nome: "", documento: "" };

export function Wizard({ token, coleta }: { token: string; coleta: ColetaPublica }) {
  // Pré-preenchido com o contato que a analista registrou ao mandar o link.
  const [nome, setNome] = useState(coleta.gestor.nome ?? "");
  const [celular, setCelular] = useState(mascararTelefone(coleta.gestor.celular ?? ""));
  const [setor, setSetor] = useState(coleta.gestor.setor ?? "");

  const [semMovimentacao, setSemMovimentacao] = useState(coleta.enviado?.semMovimentacao ?? false);
  const [entradas, setEntradas] = useState<Pessoa[]>(() => pessoasDe(coleta, "entrada"));
  const [saidas, setSaidas] = useState<Pessoa[]>(() => pessoasDe(coleta, "saida"));
  const [planilha, setPlanilha] = useState<Planilha>(null);
  const [observacao, setObservacao] = useState(coleta.enviado?.observacao ?? "");

  const [etapa, setEtapa] = useState(0);
  const [erros, setErros] = useState<Erros>({});
  const [progresso, setProgresso] = useState<number | null>(null);
  const [erroDoArquivo, setErroDoArquivo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [recado, setRecado] = useState<string | null>(null);

  /**
   * Quando preenchido, a tela é a de recebido. Começa preenchido se o gestor
   * já havia enviado — é a decisão #3: ele reabre o link e vê o que mandou,
   * em vez de um formulário em branco que o faria digitar tudo de novo.
   */
  const [recebido, setRecebido] = useState<{ protocolo: string; correcao: boolean } | null>(
    coleta.enviado ? { protocolo: coleta.protocolo, correcao: false } : null,
  );

  const escolherArquivo = useRef<HTMLInputElement>(null);

  function corpo() {
    return {
      nome,
      celular,
      setor,
      semMovimentacao,
      entradas: semMovimentacao ? [] : entradas.filter(temAlgo),
      saidas: semMovimentacao ? [] : saidas.filter(temAlgo),
      planilhaId: planilha?.id ?? "",
      observacao,
    };
  }

  /** Os erros do esquema que pertencem a esta etapa. */
  function conferir(indice: number): Erros {
    const analise = validar(esquemaColeta, corpo());
    if (analise.ok) return {};

    const todos = porCampo(analise.erros);
    const campos = CAMPOS_DA_ETAPA[indice] ?? [];
    if (campos.length === 0) return todos;

    const meus: Erros = {};
    for (const [campo, mensagem] of Object.entries(todos)) {
      if (campos.some((prefixo) => campo === prefixo || campo.startsWith(`${prefixo}.`))) meus[campo] = mensagem;
    }
    return meus;
  }

  function avancar() {
    const meus = conferir(etapa);
    setErros(meus);
    if (Object.keys(meus).length > 0) return;
    setEtapa((e) => Math.min(e + 1, ETAPAS.length - 1));
    rolarAoTopo();
  }

  function voltar() {
    setErros({});
    setEtapa((e) => Math.max(e - 1, 0));
    rolarAoTopo();
  }

  function irPara(destino: number) {
    setErros({});
    setEtapa(destino);
    rolarAoTopo();
  }

  function pegarOAtalho() {
    setSemMovimentacao(true);
    setEntradas([]);
    setSaidas([]);
    setErros({});
    // Direto à revisão: quem não teve movimentação não tem o que preencher nas
    // etapas 2 a 4, e passar por elas vazias seria pedir quatro toques para
    // nada. A revisão mostra o que vai ser enviado, e dá para desfazer lá.
    setEtapa(ETAPAS.length - 1);
    rolarAoTopo();
  }

  function desfazerOAtalho() {
    setSemMovimentacao(false);
    setEntradas([VAZIA]);
    setErros({});
    setEtapa(1);
    rolarAoTopo();
  }

  async function escolher(arquivo: File | undefined) {
    if (!arquivo) return;
    setErroDoArquivo(null);
    setProgresso(0);

    const resultado = await enviarPlanilhaComProgresso(token, arquivo, setProgresso);
    setProgresso(null);

    if (!resultado.ok) {
      setErroDoArquivo(resultado.mensagem);
      return;
    }
    setPlanilha({ id: resultado.id, nome: resultado.nome });
  }

  async function enviar() {
    const todos = conferir(ETAPAS.length - 1);
    setErros(todos);
    if (Object.keys(todos).length > 0) {
      setRecado("Falta pouco: confira o que está marcado.");
      return;
    }

    setEnviando(true);
    setRecado(null);
    const resultado = await enviarColeta(token, corpo());
    setEnviando(false);

    if (!resultado.ok) {
      setErros(resultado.falha.erros ?? {});
      setRecado(resultado.falha.mensagem);
      // O erro pode ser de um campo de outra etapa — a rota confere tudo. Levar
      // à revisão é o único lugar onde todos os campos estão visíveis de uma
      // vez, e é lá que o gestor vê qual deles está marcado.
      if (resultado.falha.erros) setEtapa(ETAPAS.length - 1);
      rolarAoTopo();
      return;
    }

    setRecebido({ protocolo: resultado.protocolo, correcao: resultado.correcao });
    rolarAoTopo();
  }

  function corrigir() {
    setRecebido(null);
    setRecado(null);
    setErros({});
    setEtapa(0);
    rolarAoTopo();
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col gap-6 px-5 py-6 md:px-0 md:py-14">
      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Logo cor="navy" altura={22} />
          <span className="inline-flex items-center gap-1.5 text-[12px] text-[var(--cp-ink-2)]">
            <Icone.cadeado />
            Página segura
          </span>
        </div>

        {recebido ? null : (
          <>
            <Pilulas etapas={ETAPAS} atual={etapa} />
            <Progresso valor={((etapa + 1) / ETAPAS.length) * 100} />
          </>
        )}
      </header>

      {recado ? (
        <Aviso tom="sage" role="alert">
          {recado}
        </Aviso>
      ) : null}

      {recebido ? (
        <Recebido
          coleta={coleta}
          protocolo={recebido.protocolo}
          correcao={recebido.correcao}
          onCorrigir={corrigir}
        />
      ) : (
        <>
          {etapa === 0 ? (
            <EtapaDados
              coleta={coleta}
              nome={nome}
              celular={celular}
              setor={setor}
              erros={erros}
              onNome={setNome}
              onCelular={setCelular}
              onSetor={setSetor}
              onSemMovimentacao={pegarOAtalho}
            />
          ) : null}

          {etapa === 1 || etapa === 2 ? (
            <EtapaPessoas
              tipo={etapa === 1 ? "entradas" : "saidas"}
              pessoas={etapa === 1 ? entradas : saidas}
              erros={erros}
              onMudar={(i, campo, valor) => {
                const trocar = (lista: Pessoa[]) =>
                  lista.map((p, j) => (j === i ? { ...p, [campo]: valor } : p));
                if (etapa === 1) setEntradas(trocar);
                else setSaidas(trocar);
              }}
              onAdicionar={() => {
                if (etapa === 1) setEntradas((l) => [...l, { ...VAZIA }]);
                else setSaidas((l) => [...l, { ...VAZIA }]);
              }}
              onRemover={(i) => {
                if (etapa === 1) setEntradas((l) => l.filter((_, j) => j !== i));
                else setSaidas((l) => l.filter((_, j) => j !== i));
              }}
            />
          ) : null}

          {etapa === 3 ? (
            <EtapaPlanilha
              planilha={planilha}
              progresso={progresso}
              erro={erroDoArquivo}
              onEscolher={() => escolherArquivo.current?.click()}
              onRemover={() => setPlanilha(null)}
            />
          ) : null}

          {etapa === 4 ? (
            <EtapaRevisao
              coleta={coleta}
              nome={nome}
              celular={celular}
              setor={setor}
              semMovimentacao={semMovimentacao}
              entradas={entradas.filter(temAlgo)}
              saidas={saidas.filter(temAlgo)}
              planilha={planilha}
              observacao={observacao}
              erros={erros}
              onIr={irPara}
              onObservacao={setObservacao}
              onVoltarAEditar={desfazerOAtalho}
            />
          ) : null}

          <div className="mt-auto flex flex-col gap-2.5 pt-2">
            {etapa === ETAPAS.length - 1 ? (
              <Btn cheio onClick={enviar} disabled={enviando} icone={enviando ? undefined : <Icone.check />}>
                {enviando
                  ? "Enviando…"
                  : semMovimentacao
                    ? `Confirmar que ninguém entrou nem saiu em ${mesEmPalavras(coleta.competencia)}`
                    : "Enviar para a MX"}
              </Btn>
            ) : (
              <Btn cheio onClick={avancar} icone={<Icone.seta />}>
                Continuar
              </Btn>
            )}

            {etapa > 0 ? (
              <Btn tipo="texto" onClick={voltar} icone={undefined}>
                <Icone.voltar />
                Voltar
              </Btn>
            ) : null}
          </div>

          {/* Fora da árvore visual: a vaga de upload é um botão, e um `input
              file` dentro dela viria com o visual do navegador por cima. */}
          <input
            ref={escolherArquivo}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            className="hidden"
            onChange={(e) => {
              void escolher(e.target.files?.[0]);
              // Zera para escolher o MESMO arquivo de novo depois de um erro
              // contar como mudança — sem isso, `onChange` não dispara.
              e.target.value = "";
            }}
          />
        </>
      )}

      <footer className="pt-2 text-[12px] leading-[1.5] text-[var(--cp-ink-2)]">
        Dúvida? Fale com a MX Corretora de Seguros. Esta página não pede senha, dado bancário nem número de cartão.
      </footer>
    </main>
  );
}

/** Pessoa que o gestor começou a preencher. Cartão em branco não vai no envio. */
function temAlgo(p: Pessoa): boolean {
  return p.nome.trim() !== "" || p.documento.trim() !== "";
}

/** O que ele já havia enviado, para o reenvio partir dali e não do zero. */
function pessoasDe(coleta: ColetaPublica, tipo: "entrada" | "saida"): Pessoa[] {
  const lista = (coleta.enviado?.movimentos ?? [])
    .filter((m) => m.tipo === tipo)
    .map((m) => ({ nome: m.nome, documento: m.documento ? mascararDocumento(m.documento) : "" }));
  return lista.length ? lista : [{ nome: "", documento: "" }];
}

function rolarAoTopo() {
  if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
}

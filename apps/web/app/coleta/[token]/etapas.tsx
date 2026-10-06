"use client";

import { formatarData } from "@/lib/dominio/email";
import { formatarMoeda, mascararData, mascararDocumento, mascararMoeda, mascararTelefone } from "@/lib/dominio/mascaras";
import type { ColetaPublica } from "@/lib/coleta/consulta";
import { ROTULO_MOVIMENTO } from "@/lib/dominio/coleta";

import {
  Aviso,
  AvisoDeSeguranca,
  Btn,
  Cabecalho,
  Campo,
  CartaoDePessoa,
  Icone,
  LinhaDeRevisao,
  VagaDeUpload,
} from "./primitivas";

/**
 * O corpo de cada etapa. O wizard guarda o estado; aqui só se desenha.
 *
 * Separado para o wizard caber na cabeça: a máquina de etapas e o estado de
 * nove campos num arquivo com 500 linhas de JSX viram um arquivo que ninguém
 * mexe sem medo.
 */

/** Nascimento, cargo e salário só são usados na entrada. */
export type Pessoa = { nome: string; documento: string; nascimento: string; cargo: string; salario: string };

export type Planilha = { id: string; nome: string } | null;

/** Os erros por campo, como `porCampo` os devolve: `entradas.0.nome`. */
export type Erros = Record<string, string>;

export const ETAPAS = ["Seus dados", "Quem entrou", "Quem saiu", "Planilha", "Revisão"] as const;

/* --------------------------------------------------------------------------
   1 · Seus dados
   -------------------------------------------------------------------------- */

export function EtapaDados({
  coleta,
  nome,
  celular,
  setor,
  erros,
  onNome,
  onCelular,
  onSetor,
  onSemMovimentacao,
}: {
  coleta: ColetaPublica;
  nome: string;
  celular: string;
  setor: string;
  erros: Erros;
  onNome: (v: string) => void;
  onCelular: (v: string) => void;
  onSetor: (v: string) => void;
  onSemMovimentacao: () => void;
}) {
  return (
    <>
      <Cabecalho
        eyebrow={`Movimentação de ${coleta.competencia.split("-").reverse().join("/")}`}
        titulo="Quem entrou e quem saiu neste mês?"
        lead="A MX usa isso para fechar a fatura do seu seguro. São duas listas curtas, e dá para pular o que não tiver."
      />

      {/* Travados: vêm do cadastro, e o formulário não é lugar de corrigir
          razão social. Mostrados porque o gestor precisa ver que é a empresa
          dele antes de digitar CPF de funcionário. */}
      <div className="flex flex-col gap-1.5 rounded-[14px] bg-[var(--cp-sky-soft)] px-4 py-3.5">
        <span className="text-[12px] uppercase tracking-[0.05em] text-[var(--cp-ink-2)]">Empresa</span>
        <span className="text-[15.5px] font-[600] text-[var(--cp-navy)]">{coleta.empresa}</span>
        <span className="cp-mono text-[13px] text-[var(--cp-ink-2)]">{coleta.documentoDaEmpresa}</span>
      </div>

      <Campo
        rotulo="Seu nome"
        value={nome}
        onChange={(e) => onNome(e.target.value)}
        erro={erros.nome}
        doCadastro={Boolean(coleta.gestor.nome) && nome === coleta.gestor.nome}
        autoComplete="name"
        enterKeyHint="next"
      />

      <Campo
        rotulo="Seu celular"
        value={celular}
        onChange={(e) => onCelular(mascararTelefone(e.target.value))}
        erro={erros.celular}
        doCadastro={Boolean(coleta.gestor.celular) && celular === mascararTelefone(coleta.gestor.celular ?? "")}
        mono
        inputMode="tel"
        autoComplete="tel"
        enterKeyHint="next"
        dica="Para a MX falar com você se faltar alguma coisa."
      />

      <Campo
        rotulo="Setor"
        value={setor}
        onChange={(e) => onSetor(e.target.value)}
        erro={erros.setor}
        autoComplete="off"
        enterKeyHint="done"
        placeholder="Opcional"
        dica="Se não souber, deixe em branco."
      />

      {/* O atalho fica AQUI, na primeira etapa, e não na revisão: quem não teve
          movimentação precisa poder sair em dois toques, e não percorrer quatro
          telas vazias para dizer que não tem nada a dizer. */}
      <div className="flex flex-col gap-2.5 rounded-[14px] border-[1.5px] border-dashed border-[var(--cp-line)] px-4 py-4">
        <span className="text-[14px] leading-[1.5] text-[var(--cp-ink)]">
          Ninguém entrou nem saiu em {mesEmPalavras(coleta.competencia)}?
        </span>
        <Btn tipo="suave" onClick={onSemMovimentacao}>
          Ninguém entrou nem saiu
        </Btn>
      </div>
    </>
  );
}

/* --------------------------------------------------------------------------
   2 e 3 · Quem entrou / Quem saiu
   -------------------------------------------------------------------------- */

export function EtapaPessoas({
  tipo,
  pessoas,
  erros,
  onMudar,
  onAdicionar,
  onRemover,
}: {
  tipo: "entradas" | "saidas";
  pessoas: Pessoa[];
  erros: Erros;
  onMudar: (indice: number, campo: keyof Pessoa, valor: string) => void;
  onAdicionar: () => void;
  onRemover: (indice: number) => void;
}) {
  const entrada = tipo === "entradas";
  const verbo = entrada ? "entrou" : "saiu";

  return (
    <>
      <Cabecalho
        eyebrow={`Etapa ${entrada ? 2 : 3} de 5`}
        titulo={entrada ? "Quem entrou no seguro?" : "Quem saiu do seguro?"}
        lead={
          entrada
            ? "Nome, CPF, nascimento, cargo e salário de cada admitido. Se não tiver algum dado à mão, deixe em branco."
            : "Nome e CPF de cada desligado neste mês."
        }
      />

      {pessoas.length === 0 ? (
        <Aviso tom="sage">
          Ninguém {verbo} neste mês? Siga sem preencher — você pode voltar depois se lembrar de alguém.
        </Aviso>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {pessoas.map((pessoa, i) => (
            <CartaoDePessoa
              key={i}
              indice={i}
              deQue={verbo}
              nome={pessoa.nome}
              documento={pessoa.documento}
              erroNome={erros[`${tipo}.${i}.nome`]}
              erroDocumento={erros[`${tipo}.${i}.documento`]}
              onNome={(v) => onMudar(i, "nome", v)}
              onDocumento={(v) => onMudar(i, "documento", mascararDocumento(v))}
              onRemover={() => onRemover(i)}
              inclusao={
                entrada
                  ? {
                      nascimento: pessoa.nascimento,
                      cargo: pessoa.cargo,
                      salario: pessoa.salario,
                      erros: {
                        nascimento: erros[`${tipo}.${i}.nascimento`],
                        cargo: erros[`${tipo}.${i}.cargo`],
                        salario: erros[`${tipo}.${i}.salario`],
                      },
                      onMudar: (campo, v) =>
                        onMudar(
                          i,
                          campo,
                          campo === "nascimento" ? mascararData(v) : campo === "salario" ? mascararMoeda(v) : v,
                        ),
                    }
                  : undefined
              }
            />
          ))}
        </ul>
      )}

      <Btn tipo="fantasma" cheio onClick={onAdicionar} icone={<Icone.mais />}>
        {pessoas.length === 0 ? `Adicionar quem ${verbo}` : "Adicionar outra pessoa"}
      </Btn>
    </>
  );
}

/* --------------------------------------------------------------------------
   4 · Planilha
   -------------------------------------------------------------------------- */

export function EtapaPlanilha({
  planilha,
  progresso,
  erro,
  onEscolher,
  onRemover,
}: {
  planilha: Planilha;
  /** 0 a 100 enquanto sobe; `null` quando não há envio em curso. */
  progresso: number | null;
  erro: string | null;
  onEscolher: () => void;
  onRemover: () => void;
}) {
  return (
    <>
      <Cabecalho
        eyebrow="Etapa 4 de 5"
        titulo="Tem a planilha do mês?"
        lead="Se a sua empresa já monta uma planilha de movimentação, anexe aqui. Quem não tem pode pular: o que você digitou já basta."
      />

      <VagaDeUpload
        rotulo="Planilha do mês"
        deQue="do mês"
        estado={progresso !== null ? "subindo" : planilha ? "enviada" : "vazia"}
        progresso={progresso ?? undefined}
        nome={planilha?.nome}
        onEscolher={onEscolher}
      />

      {erro ? (
        <Aviso tom="sage" role="alert">
          {erro}
        </Aviso>
      ) : null}

      {planilha && progresso === null ? (
        <Btn tipo="texto" onClick={onRemover} icone={<Icone.fechar />}>
          Tirar esta planilha
        </Btn>
      ) : null}

      <AvisoDeSeguranca>
        A planilha fica guardada com a MX, usada só para fechar a fatura deste mês, e apagada depois do prazo de
        guarda. Não pedimos senha, dado bancário nem número de cartão aqui.
      </AvisoDeSeguranca>
    </>
  );
}

/* --------------------------------------------------------------------------
   5 · Revisão
   -------------------------------------------------------------------------- */

export function EtapaRevisao({
  coleta,
  nome,
  celular,
  setor,
  semMovimentacao,
  entradas,
  saidas,
  planilha,
  observacao,
  erros,
  onIr,
  onObservacao,
  onVoltarAEditar,
}: {
  coleta: ColetaPublica;
  nome: string;
  celular: string;
  setor: string;
  semMovimentacao: boolean;
  entradas: Pessoa[];
  saidas: Pessoa[];
  planilha: Planilha;
  observacao: string;
  erros: Erros;
  onIr: (etapa: number) => void;
  onObservacao: (v: string) => void;
  /** Desfaz o atalho e abre as listas. */
  onVoltarAEditar: () => void;
}) {
  return (
    <>
      <Cabecalho
        eyebrow="Etapa 5 de 5"
        titulo="Confira antes de enviar"
        lead="Dê uma olhada: depois do envio a MX já começa a fechar a fatura com isso."
      />

      {erros.semMovimentacao ? (
        <Aviso tom="sage" role="alert">
          {erros.semMovimentacao}
        </Aviso>
      ) : null}

      <div className="flex flex-col">
        <LinhaDeRevisao rotulo="Seu nome" valor={nome || "—"} vazio={!nome} erro={erros.nome} onEditar={() => onIr(0)} />
        <LinhaDeRevisao
          rotulo="Seu celular"
          valor={celular || "—"}
          vazio={!celular}
          erro={erros.celular}
          onEditar={() => onIr(0)}
        />
        <LinhaDeRevisao
          rotulo="Setor"
          valor={setor || "Não informado"}
          vazio={!setor}
          onEditar={() => onIr(0)}
        />
      </div>

      {semMovimentacao ? (
        <Aviso tom="ok" icone={<Icone.check />}>
          <strong className="font-[600]">Ninguém entrou nem saiu em {mesEmPalavras(coleta.competencia)}.</strong>
          <br />
          É isso que vai para a MX.{" "}
          <button
            type="button"
            onClick={onVoltarAEditar}
            className="underline underline-offset-2 [text-decoration-thickness:1px]"
          >
            Preencher as listas
          </button>
        </Aviso>
      ) : (
        <div className="flex flex-col gap-5">
          <ListaDeRevisao tipo="entradas" pessoas={entradas} onEditar={() => onIr(1)} />
          <ListaDeRevisao tipo="saidas" pessoas={saidas} onEditar={() => onIr(2)} />
          <div className="flex flex-col">
            <LinhaDeRevisao
              rotulo="Planilha"
              valor={planilha ? planilha.nome : "Não enviada"}
              vazio={!planilha}
              onEditar={() => onIr(3)}
            />
          </div>
        </div>
      )}

      <Campo
        rotulo="Quer dizer mais alguma coisa?"
        value={observacao}
        onChange={(e) => onObservacao(e.target.value)}
        erro={erros.observacao}
        placeholder="Opcional"
        enterKeyHint="done"
        dica="A analista da MX lê junto com a movimentação."
      />

      <AvisoDeSeguranca>
        Nome e CPF das pessoas ficam com a MX Corretora de Seguros e com a seguradora, usados só para administrar
        este seguro. São apagados depois do prazo de guarda.
      </AvisoDeSeguranca>
    </>
  );
}

function ListaDeRevisao({
  tipo,
  pessoas,
  onEditar,
}: {
  tipo: "entradas" | "saidas";
  pessoas: Pessoa[];
  onEditar: () => void;
}) {
  const rotulo = ROTULO_MOVIMENTO[tipo === "entradas" ? "entrada" : "saida"];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-[600] uppercase tracking-[0.05em] text-[var(--cp-ink-2)]">
          {rotulo} · {pessoas.length}
        </span>
        <button
          type="button"
          onClick={onEditar}
          aria-label={`Editar ${rotulo.toLowerCase()}`}
          className="inline-flex items-center gap-1.5 py-0.5 text-[13px] font-[600] text-[var(--cp-navy)]"
        >
          <Icone.editar />
          Editar
        </button>
      </div>
      {pessoas.length === 0 ? (
        <span className="text-[14px] text-[var(--cp-ink-2)]">Ninguém</span>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {pessoas.map((p, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-2.5 text-[14.5px] text-[var(--cp-black)]">
              <span className="font-[500]">{p.nome || "Sem nome"}</span>
              <span className="cp-mono text-[12.5px] text-[var(--cp-ink-2)]">{p.documento || "sem CPF"}</span>
              {tipo === "entradas" && (p.nascimento || p.cargo || p.salario) ? (
                <span className="basis-full text-[12.5px] text-[var(--cp-ink-2)]">
                  {[p.nascimento && `nasc. ${p.nascimento}`, p.cargo, p.salario && formatarMoeda(p.salario)]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Depois do envio
   -------------------------------------------------------------------------- */

/**
 * A tela de sucesso: o protocolo e o que vem depois.
 *
 * Os marcos são as datas reais do mês, e não um texto genérico. Quem informou a
 * movimentação quer saber quando chega o boleto — e dizer "em breve" é o tipo de
 * frase que faz o gestor ligar para a MX perguntando.
 */
export function Recebido({
  coleta,
  protocolo,
  correcao,
  onCorrigir,
}: {
  coleta: ColetaPublica;
  protocolo: string;
  correcao: boolean;
  onCorrigir: () => void;
}) {
  const marcos = [
    coleta.datas.corte ? { quando: coleta.datas.corte, o: "A seguradora fecha a movimentação do mês" } : null,
    { quando: coleta.datas.boleto, o: "A MX envia o boleto" },
    { quando: coleta.datas.vencimento, o: "Vencimento" },
  ].filter((m): m is { quando: string; o: string } => m !== null);

  return (
    <>
      <Cabecalho
        eyebrow="Recebido"
        titulo={correcao ? `Atualizamos, ${primeiroNome(coleta.gestor.nome)}.` : `Recebemos, ${primeiroNome(coleta.gestor.nome)}.`}
        lead={
          correcao
            ? "A analista da MX foi avisada de que você corrigiu a movimentação deste mês."
            : "A MX já está com a movimentação deste mês. Você não precisa fazer mais nada agora."
        }
      />

      <div className="flex flex-col gap-1.5 rounded-[14px] bg-[var(--cp-ok-soft)] px-4 py-3.5">
        <span className="text-[12px] uppercase tracking-[0.05em] text-[var(--cp-ink-2)]">Protocolo</span>
        <span className="cp-mono text-[16px] font-[500] text-[var(--cp-navy)]">{protocolo}</span>
        <span className="text-[12.5px] leading-[1.45] text-[var(--cp-ink)]">
          Guarde este número: é por ele que a MX acha o seu envio.
        </span>
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-[13px] font-[600] uppercase tracking-[0.05em] text-[var(--cp-ink-2)]">
          O que vem depois
        </span>
        <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
          {marcos.map((marco) => (
            <li key={marco.quando} className="flex items-baseline gap-3 text-[14.5px] text-[var(--cp-ink)]">
              <span className="cp-mono shrink-0 text-[13px] font-[500] text-[var(--cp-navy)]">
                {formatarData(marco.quando)}
              </span>
              <span>{marco.o}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* A decisão #3: o link continua dele. Ele não tem conta, então esta é a
          única porta para rever o que mandou — fechá-la tiraria a cópia da mão
          de quem informou. */}
      <div className="flex flex-col gap-2.5 rounded-[14px] border-[1.5px] border-[var(--cp-line)] px-4 py-4">
        <span className="text-[14px] leading-[1.5] text-[var(--cp-ink)]">
          Este link continua aberto para você. Se faltou alguém ou algo saiu errado, pode corrigir — a MX é avisada.
        </span>
        <Btn tipo="fantasma" onClick={onCorrigir}>
          Corrigir o que enviei
        </Btn>
      </div>
    </>
  );
}

/* --------------------------------------------------------------------------
   Pedaços
   -------------------------------------------------------------------------- */

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** `2026-09` → `setembro`. */
export function mesEmPalavras(competencia: string): string {
  const mes = Number(competencia.split("-")[1]);
  return MESES[mes - 1] ?? competencia;
}

/**
 * O primeiro nome, para a tela de sucesso cumprimentar.
 *
 * Vazio vira "tudo certo": "Recebemos, ." é pior que não cumprimentar.
 */
function primeiroNome(nome: string | null): string {
  const primeiro = (nome ?? "").trim().split(/\s+/)[0];
  return primeiro || "tudo certo";
}

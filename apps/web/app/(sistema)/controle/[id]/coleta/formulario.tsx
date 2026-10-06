"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Botao } from "@/componentes/ui/botao";
import { Campo } from "@/componentes/ui/campo";
import { Stepper } from "@/componentes/ui/stepper";
import type { LinhaDoControle } from "@/lib/controles/consulta";
import { esquemaColeta } from "@/lib/dominio/coleta";
import { nomeDoMes, rotuloDaCompetencia } from "@/lib/dominio/controle";
import { formatarDocumento } from "@/lib/dominio/documento";
import { formatarData } from "@/lib/dominio/email";
import {
  formatarMoeda,
  mascararData,
  mascararDocumento,
  mascararMoeda,
  mascararTelefone,
} from "@/lib/dominio/mascaras";
import { porCampo, validar } from "@/lib/dominio/validar";

/**
 * "Ou preencha agora": a coleta digitada pela analista, nas 5 etapas do
 * protótipo v0.7 (tLink) — Dados · Entradas · Saídas · Planilha · Revisão.
 *
 * Registrar sem ninguém informado é válido: a coleta nasce com link e fica no
 * Controle aguardando o gestor. Com pessoas ou planilha, a movimentação entra
 * marcada como digitada pela MX.
 */

const ETAPAS = [
  { chave: "dados", rotulo: "Dados", titulo: "Quem é o segurado", lead: "O mínimo para não perder o contato: segurado, competência, gestor e celular." },
  { chave: "entradas", rotulo: "Entradas", titulo: "Quem entrou", lead: "Se o gestor já passou por telefone. Senão, ele informa pelo link." },
  { chave: "saidas", rotulo: "Saídas", titulo: "Quem saiu", lead: "Se o gestor já passou por telefone. Senão, ele informa pelo link." },
  { chave: "planilha", rotulo: "Planilha", titulo: "Planilha do mês", lead: "Se tiver em mãos.", opcional: true },
  { chave: "revisao", rotulo: "Revisão", titulo: "Atendimento e revisão", lead: "Analista responsável e o que ficou registrado." },
] as const;

type Pessoa = { nome: string; documento: string; nascimento: string; cargo: string; salario: string };
const VAZIA: Pessoa = { nome: "", documento: "", nascimento: "", cargo: "", salario: "" };

const CAMPOS_DA_ETAPA = [["nome", "celular"], ["entradas"], ["saidas"], ["planilhaId"], []] as const;

export function FormularioDaEquipe({
  linha,
  cliente,
  apolice,
  analista,
  valeAte,
  temLink,
  nome,
  celular,
  onNome,
  onCelular,
  onRegistrada,
}: {
  linha: LinhaDoControle;
  cliente: string;
  apolice: string | null;
  analista: string;
  valeAte: string;
  /** Já existe link: registrar não pode refazê-lo, senão mata o do gestor. */
  temLink: boolean;
  nome: string;
  celular: string;
  onNome: (v: string) => void;
  onCelular: (v: string) => void;
  /** Depois de registrar: a tela troca para o envio pelo WhatsApp. */
  onRegistrada: (protocolo: string) => void;
}) {
  const router = useRouter();
  const [etapa, setEtapa] = useState(0);
  const [semMovimentacao, setSemMovimentacao] = useState(false);
  const [entradas, setEntradas] = useState<Pessoa[]>([{ ...VAZIA }]);
  const [saidas, setSaidas] = useState<Pessoa[]>([{ ...VAZIA }]);
  const [planilha, setPlanilha] = useState<{ id: string; nome: string } | null>(null);
  const [subindo, setSubindo] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [recado, setRecado] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);

  const preenchidas = (l: Pessoa[]) => l.filter((p) => Object.values(p).some((v) => v.trim()));
  const informou = semMovimentacao || preenchidas(entradas).length + preenchidas(saidas).length > 0 || planilha;

  function corpo() {
    return {
      nome,
      celular,
      setor: "",
      semMovimentacao,
      entradas: semMovimentacao ? [] : preenchidas(entradas),
      saidas: semMovimentacao ? [] : preenchidas(saidas).map(({ nome: n, documento }) => ({ nome: n, documento })),
      planilhaId: planilha?.id ?? "",
      observacao: "",
    };
  }

  function errosDaEtapa(indice: number): Record<string, string> {
    const analise = validar(esquemaColeta, corpo());
    if (analise.ok) return {};
    const todos = porCampo(analise.erros);
    // Registrar sem movimentação é válido aqui: a coleta espera o gestor.
    if (!informou) delete todos.semMovimentacao;
    const campos: readonly string[] = CAMPOS_DA_ETAPA[indice] ?? [];
    if (!campos.length) return todos;
    return Object.fromEntries(
      Object.entries(todos).filter(([c]) => campos.some((p) => c === p || c.startsWith(`${p}.`))),
    );
  }

  function ir(destino: number) {
    setErros({});
    setEtapa(destino);
  }

  function continuar() {
    const meus = errosDaEtapa(etapa);
    setErros(meus);
    if (!Object.keys(meus).length) setEtapa((e) => e + 1);
  }

  async function subir(escolhido: File | undefined) {
    if (!escolhido) return;
    setSubindo(true);
    setRecado(null);
    try {
      const dados = new FormData();
      dados.append("arquivo", escolhido);
      const resposta = await fetch(`/api/v1/controles/${linha.id}/planilha`, { method: "POST", body: dados });
      const json = await resposta.json().catch(() => null);
      if (!resposta.ok) setRecado(json?.error?.message ?? "Não foi possível anexar a planilha.");
      else setPlanilha({ id: json.data.id, nome: json.data.nome });
    } catch {
      setRecado("Não foi possível falar com o servidor.");
    } finally {
      setSubindo(false);
    }
  }

  async function registrar() {
    const todos = errosDaEtapa(4);
    setErros(todos);
    if (Object.keys(todos).length) {
      setRecado("Confira os campos destacados.");
      return;
    }

    setSalvando(true);
    setRecado(null);
    try {
      // Gera o link se ainda não houver: é por ele que o gestor confirma ou
      // completa. O que já existe fica — refazer mataria o que ele recebeu.
      const link = temLink ? null : await fetch(`/api/v1/controles/${linha.id}/coleta`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, celular, setor: "" }),
      });
      const jsonLink = link ? await link.json().catch(() => null) : null;
      if (link && !link.ok) {
        setRecado(jsonLink?.error?.message ?? "Não foi possível registrar a coleta.");
        return;
      }

      if (informou) {
        const resposta = await fetch(`/api/v1/controles/${linha.id}/coleta`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corpo()),
        });
        const json = await resposta.json().catch(() => null);
        if (!resposta.ok) {
          const lista = json?.error?.fields as { campo: string; mensagem: string }[] | undefined;
          if (lista?.length) setErros(Object.fromEntries(lista.map((e) => [e.campo, e.mensagem])));
          setRecado(json?.error?.message ?? "Não foi possível registrar a movimentação.");
          return;
        }
      }

      onRegistrada(linha.protocolo ?? "");
      router.refresh();
    } catch {
      setRecado("Não foi possível falar com o servidor. O que você digitou continua aqui.");
    } finally {
      setSalvando(false);
    }
  }

  const atual = ETAPAS[etapa]!;

  return (
    <div className="flex flex-col gap-5">
      <Stepper etapas={ETAPAS} atual={etapa} onIr={ir} rotulo="Etapas da coleta" />

      <div className="flex flex-col gap-1">
        <span className="text-[12px] font-[600] uppercase tracking-[0.05em] text-muted">
          Etapa {etapa + 1} de {ETAPAS.length}
          {"opcional" in atual ? " · opcional" : ""}
        </span>
        <h2 className="m-0 font-(family-name:--font-display) text-[17px] font-[600] text-heading">{atual.titulo}</h2>
        <p className="m-0 text-[13px] text-muted">{atual.lead}</p>
      </div>

      {recado ? (
        <p role="alert" className="rounded-[8px] border border-warn bg-warn-soft p-3 text-[13.5px] text-texto">
          {recado}
        </p>
      ) : null}

      {etapa === 0 ? (
        <div className="grid items-start gap-3 sm:grid-cols-2">
          <Campo rotulo="Segurado" value={cliente} readOnly />
          <Campo rotulo="Competência" value={rotuloDaCompetencia(linha.competencia)} readOnly />
          <Campo rotulo="CNPJ" value={formatarDocumento(linha.documento)} readOnly />
          <Campo rotulo="Apólice" value={apolice ?? "Não cadastrada"} readOnly />
          <Campo rotulo="Gestor responsável" value={nome} onChange={(e) => onNome(e.target.value)} erro={erros.nome} required />
          <Campo
            rotulo="Celular (WhatsApp)"
            value={celular}
            onChange={(e) => onCelular(mascararTelefone(e.target.value))}
            erro={erros.celular}
            inputMode="tel"
            required
            dica="Para onde vai o link e a confirmação."
          />
          <label className="flex items-start gap-2.5 text-[13.5px] text-texto sm:col-span-2">
            <input
              type="checkbox"
              checked={semMovimentacao}
              onChange={(e) => setSemMovimentacao(e.target.checked)}
              className="mt-[3px] size-4 accent-[var(--brand)]"
            />
            O gestor informou que ninguém entrou nem saiu em {nomeDoMes(linha.competencia)}.
          </label>
        </div>
      ) : null}

      {etapa === 1 || etapa === 2 ? (
        semMovimentacao ? (
          <p className="m-0 text-[13.5px] text-muted">Marcado como sem movimentação na etapa Dados.</p>
        ) : (
          <Pessoas
            tipo={etapa === 1 ? "entradas" : "saidas"}
            pessoas={etapa === 1 ? entradas : saidas}
            erros={erros}
            onMudar={(lista) => (etapa === 1 ? setEntradas(lista) : setSaidas(lista))}
          />
        )
      ) : null}

      {etapa === 3 ? (
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => arquivo.current?.click()}
            disabled={subindo}
            className="flex flex-col items-center gap-1 rounded-[8px] border-2 border-dashed border-line bg-surface-2 px-4 py-6 text-center"
          >
            <b className="text-[14px] font-[600] text-heading">
              {subindo ? "Enviando…" : planilha ? planilha.nome : "Planilha do cliente"}
            </b>
            <span className="text-[12.5px] text-muted">
              {planilha ? "Anexada · clique para trocar" : "xlsx ou csv, se o gestor já mandou"}
            </span>
          </button>
          {planilha ? (
            <div>
              <Botao variante="texto" onClick={() => setPlanilha(null)}>
                Tirar esta planilha
              </Botao>
            </div>
          ) : null}
          <input
            ref={arquivo}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              void subir(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      ) : null}

      {etapa === 4 ? (
        <div className="flex flex-col gap-4">
          <div className="grid items-start gap-3 sm:grid-cols-2">
            <Campo rotulo="Analista responsável" value={analista} readOnly />
            <Campo
              rotulo="Link vale até"
              value={formatarData(valeAte)}
              readOnly
              dica={linha.datas.corte ? `corte em ${formatarData(linha.datas.corte)}` : undefined}
            />
          </div>
          <dl className="m-0 flex flex-col">
            <Revisao rotulo="Segurado" valor={`${cliente} · ${apolice ?? "sem apólice"} · ${rotuloDaCompetencia(linha.competencia).toLowerCase()}`} onEditar={() => ir(0)} />
            <Revisao rotulo="Gestor" valor={[nome, celular].filter(Boolean).join(" · ") || "—"} erro={erros.nome ?? erros.celular} onEditar={() => ir(0)} />
            <Revisao
              rotulo="Entradas"
              valor={semMovimentacao ? "Ninguém entrou" : resumo(preenchidas(entradas), true)}
              vazio={!preenchidas(entradas).length}
              onEditar={() => ir(1)}
            />
            <Revisao
              rotulo="Saídas"
              valor={semMovimentacao ? "Ninguém saiu" : resumo(preenchidas(saidas), false)}
              vazio={!preenchidas(saidas).length}
              onEditar={() => ir(2)}
            />
            <Revisao rotulo="Planilha" valor={planilha?.nome ?? "Não enviada · opcional"} vazio={!planilha} onEditar={() => ir(3)} />
          </dl>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2.5 border-t border-line pt-4">
        {etapa > 0 ? (
          <Botao variante="secundario" onClick={() => ir(etapa - 1)}>
            ← Voltar
          </Botao>
        ) : (
          <Botao variante="texto" onClick={() => ir(4)}>
            Pular para a revisão
          </Botao>
        )}
        <span className="flex-1" />
        {etapa === 4 ? (
          <Botao onClick={() => void registrar()} disabled={salvando}>
            {salvando ? "Registrando…" : "Registrar coleta"}
          </Botao>
        ) : (
          <Botao onClick={continuar}>{etapa === 3 && !planilha ? "Pular por agora →" : "Continuar →"}</Botao>
        )}
      </div>
    </div>
  );
}

function resumo(pessoas: Pessoa[], entrada: boolean): string {
  if (!pessoas.length) return entrada ? "Nenhuma · o gestor informa pelo link" : "Nenhuma · o gestor informa pelo link";
  return pessoas.map((p) => p.nome || "sem nome").join(", ");
}

function Revisao({
  rotulo,
  valor,
  vazio = false,
  erro,
  onEditar,
}: {
  rotulo: string;
  valor: string;
  vazio?: boolean;
  erro?: string;
  onEditar: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line py-2.5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <dt className="text-[12px] text-muted">{rotulo}</dt>
        <dd className={`m-0 break-words text-[13.5px] ${vazio ? "text-muted" : "font-[500] text-heading"}`}>{valor}</dd>
        {erro ? <span className="text-[12.5px] text-bad">{erro}</span> : null}
      </div>
      <Botao variante="texto" onClick={onEditar} aria-label={`Editar ${rotulo.toLowerCase()}`}>
        ✎ Editar
      </Botao>
    </div>
  );
}

function Pessoas({
  tipo,
  pessoas,
  erros,
  onMudar,
}: {
  tipo: "entradas" | "saidas";
  pessoas: Pessoa[];
  erros: Record<string, string>;
  onMudar: (lista: Pessoa[]) => void;
}) {
  const entrada = tipo === "entradas";
  const mudar = (i: number, campo: keyof Pessoa, valor: string) =>
    onMudar(pessoas.map((p, j) => (j === i ? { ...p, [campo]: valor } : p)));

  return (
    <div className="flex flex-col gap-3">
      {pessoas.map((p, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-[8px] border border-line bg-surface p-3.5">
          <div className="flex items-center justify-between">
            <b className="text-[13px] font-[600] text-heading">{p.nome || (entrada ? "Quem entrou" : "Quem saiu")}</b>
            <Botao variante="texto" onClick={() => onMudar(pessoas.filter((_, j) => j !== i))} aria-label={`Remover a ${i + 1}ª pessoa`}>
              Remover
            </Botao>
          </div>
          <div className="grid items-start gap-3 sm:grid-cols-2">
            <Campo
              rotulo="Nome completo"
              value={p.nome}
              onChange={(e) => mudar(i, "nome", e.target.value)}
              erro={erros[`${tipo}.${i}.nome`]}
              placeholder="Como está no RG"
              autoComplete="off"
            />
            <Campo
              rotulo="CPF"
              value={p.documento}
              onChange={(e) => mudar(i, "documento", mascararDocumento(e.target.value))}
              erro={erros[`${tipo}.${i}.documento`]}
              placeholder="000.000.000-00"
              inputMode="numeric"
              autoComplete="off"
            />
            {entrada ? (
              <>
                <Campo
                  rotulo="Data de nascimento"
                  value={p.nascimento}
                  onChange={(e) => mudar(i, "nascimento", mascararData(e.target.value))}
                  erro={erros[`${tipo}.${i}.nascimento`]}
                  placeholder="dd/mm/aaaa"
                  inputMode="numeric"
                  autoComplete="off"
                />
                <Campo
                  rotulo="Cargo"
                  value={p.cargo}
                  onChange={(e) => mudar(i, "cargo", e.target.value)}
                  erro={erros[`${tipo}.${i}.cargo`]}
                  autoComplete="off"
                />
                <Campo
                  rotulo="Salário"
                  value={p.salario}
                  onChange={(e) => mudar(i, "salario", mascararMoeda(e.target.value))}
                  erro={erros[`${tipo}.${i}.salario`]}
                  placeholder={formatarMoeda(0)}
                  inputMode="numeric"
                  autoComplete="off"
                />
              </>
            ) : null}
          </div>
        </div>
      ))}
      <div>
        <Botao variante="secundario" onClick={() => onMudar([...pessoas, { ...VAZIA }])}>
          + Adicionar outra pessoa
        </Botao>
      </div>
    </div>
  );
}

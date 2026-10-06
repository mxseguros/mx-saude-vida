"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Botao } from "@/componentes/ui/botao";
import { Campo } from "@/componentes/ui/campo";
import { Modal } from "@/componentes/ui/modal";
import { useAviso } from "@/componentes/ui/aviso";
import type { Capital } from "@/lib/dominio/apolice";
import {
  ativo,
  capitalDoFuncionario,
  cpfOculto,
  esquemaDemissao,
  esquemaFuncionario,
  type Funcionario,
  type Resumo,
} from "@/lib/dominio/funcionario";
import {
  formatarMoeda,
  isoParaDataBr,
  mascararData,
  mascararDocumento,
  mascararMoeda,
} from "@/lib/dominio/mascaras";
import { porCampo, validar } from "@/lib/dominio/validar";

type Aba = "ativos" | "demitidos" | "todos";
type Form = Record<"nome" | "documento" | "nascimento" | "cargo" | "salario" | "setor" | "gestor" | "admissao", string>;

const VAZIO: Form = { nome: "", documento: "", nascimento: "", cargo: "", salario: "", setor: "", gestor: "", admissao: "" };

const paraForm = (f: Funcionario): Form => ({
  nome: f.nome,
  documento: f.documento ? mascararDocumento(f.documento) : "",
  nascimento: isoParaDataBr(f.nascimento),
  cargo: f.cargo ?? "",
  salario: f.salario === null ? "" : formatarMoeda(f.salario),
  setor: f.setor ?? "",
  gestor: f.gestor ?? "",
  admissao: isoParaDataBr(f.admissao),
});

const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function Funcionarios({
  clienteId,
  lista,
  resumo,
  capital,
  temApolice,
}: {
  clienteId: string;
  lista: Funcionario[];
  resumo: Resumo;
  capital: Capital | null;
  temApolice: boolean;
}) {
  const router = useRouter();
  const aviso = useAviso();

  const [aba, setAba] = useState<Aba>("ativos");
  const [busca, setBusca] = useState("");
  const [setor, setSetor] = useState("");
  const [gestor, setGestor] = useState("");
  const [cargo, setCargo] = useState("");

  // Janela de cadastro: `id` nulo = novo (ou readmissão, que é um vínculo novo).
  const [editando, setEditando] = useState<{ id: string | null; form: Form; titulo: string } | null>(null);
  const [demitindo, setDemitindo] = useState<Funcionario | null>(null);
  const [importando, setImportando] = useState(false);

  const opcoes = (campo: "setor" | "gestor" | "cargo") =>
    [...new Set(lista.map((f) => f[campo]).filter((v): v is string => Boolean(v)))].sort((a, b) => a.localeCompare(b, "pt-BR"));

  const visiveis = useMemo(() => {
    const termo = semAcento(busca.trim());
    const digitos = busca.replace(/\D/g, "");
    return lista.filter((f) => {
      if (aba === "ativos" && !ativo(f)) return false;
      if (aba === "demitidos" && ativo(f)) return false;
      if (setor && f.setor !== setor) return false;
      if (gestor && f.gestor !== gestor) return false;
      if (cargo && f.cargo !== cargo) return false;
      if (termo && !semAcento(f.nome).includes(termo) && !(digitos && (f.documento ?? "").includes(digitos))) return false;
      return true;
    });
  }, [lista, aba, busca, setor, gestor, cargo]);

  const capitalDe = (f: Funcionario) => {
    const c = capitalDoFuncionario(capital, f);
    return c === null ? "—" : formatarMoeda(c);
  };

  function acoes(f: Funcionario) {
    return ativo(f) ? (
      <>
        <Botao variante="texto" onClick={() => setEditando({ id: f.id, form: paraForm(f), titulo: "Editar funcionário" })}>
          Editar
        </Botao>
        <Botao variante="texto" className="text-bad" onClick={() => setDemitindo(f)}>
          Demitir
        </Botao>
      </>
    ) : (
      <Botao
        variante="texto"
        onClick={() =>
          setEditando({
            id: null,
            form: { ...paraForm(f), admissao: "" },
            titulo: "Readmitir funcionário",
          })
        }
      >
        Readmitir
      </Botao>
    );
  }

  const situacao = (f: Funcionario) =>
    ativo(f) ? (
      <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[11.5px] font-[600] text-ok">ativo</span>
    ) : (
      <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11.5px] text-muted" title={f.motivo ?? undefined}>
        demitido {isoParaDataBr(f.saida)}
      </span>
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-3">
        <p className="m-0 flex-1 text-[13px] text-muted">
          {resumo.ativos} {resumo.ativos === 1 ? "ativo" : "ativos"}
          {temApolice ? ` · capital segurado ${formatarMoeda(resumo.capitalTotal)}` : " · sem apólice cadastrada"}
          {resumo.premioPrevisto !== null ? ` · prêmio previsto ${formatarMoeda(resumo.premioPrevisto)}` : ""}
          {temApolice && resumo.semCapital ? ` · ${resumo.semCapital} sem capital calculado` : ""}
        </p>
        <div className="flex flex-wrap gap-2.5">
          <Botao variante="secundario" onClick={() => setImportando(true)}>
            Importar planilha
          </Botao>
          <Botao onClick={() => setEditando({ id: null, form: VAZIO, titulo: "Adicionar funcionário" })}>
            + Adicionar funcionário
          </Botao>
        </div>
      </div>

      <div className="grid items-end gap-2.5 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]">
        <Campo rotulo="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome ou CPF" />
        <Filtro rotulo="Setor" valor={setor} opcoes={opcoes("setor")} onMudar={setSetor} />
        <Filtro rotulo="Gestor" valor={gestor} opcoes={opcoes("gestor")} onMudar={setGestor} />
        <Filtro rotulo="Cargo" valor={cargo} opcoes={opcoes("cargo")} onMudar={setCargo} />
        <div role="group" aria-label="Situação" className="flex h-[42px] overflow-hidden rounded-[6px] border border-line-strong">
          {(
            [
              ["ativos", `Ativos · ${resumo.ativos}`],
              ["demitidos", `Demitidos · ${resumo.demitidos}`],
              ["todos", "Todos"],
            ] as const
          ).map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              aria-pressed={aba === valor}
              onClick={() => setAba(valor)}
              className={`px-3 text-[13px] font-[600] ${aba === valor ? "bg-brand text-on-brand" : "bg-surface text-texto hover:bg-surface-2"}`}
            >
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      {visiveis.length === 0 ? (
        <p className="rounded-[10px] border border-line bg-surface p-4 text-[13.5px] text-muted">
          {lista.length === 0
            ? "Nenhum funcionário cadastrado. Adicione um por um ou importe a planilha do cliente."
            : "Ninguém com estes filtros."}
        </p>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-[10px] border border-line bg-surface md:block">
            <table className="w-full table-fixed border-collapse text-[13px]">
              <colgroup>
                <col className="w-[19%]" />
                <col className="w-[10%]" />
                <col className="w-[8%]" />
                <col className="w-[9%]" />
                <col className="w-[10%]" />
                <col className="w-[9%]" />
                <col className="w-[10%]" />
                <col className="w-[8%]" />
                <col className="w-[9%]" />
                <col className="w-[8%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-line text-left">
                  {["Nome", "CPF", "Nascimento", "Cargo", "Capital", "Setor", "Gestor responsável", "Desde", "Situação", ""].map((t, i) => (
                    <th
                      key={t || i}
                      className={`px-2.5 py-2.5 font-(family-name:--font-display) text-[11px] font-[700] uppercase tracking-[.06em] text-muted ${t === "Capital" ? "text-right" : ""}`}
                    >
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visiveis.map((f) => (
                  <tr key={f.id} className="border-b border-line align-top last:border-0">
                    <td className="break-words px-2.5 py-2.5 font-[600] text-heading">{f.nome}</td>
                    <td className="tabular px-2.5 py-2.5 text-muted">{cpfOculto(f.documento)}</td>
                    <td className="tabular px-2.5 py-2.5">{isoParaDataBr(f.nascimento) || "—"}</td>
                    <td className="break-words px-2.5 py-2.5">{f.cargo ?? "—"}</td>
                    <td className="tabular px-2.5 py-2.5 text-right">{capitalDe(f)}</td>
                    <td className="break-words px-2.5 py-2.5">{f.setor ?? "—"}</td>
                    <td className="break-words px-2.5 py-2.5">{f.gestor ?? "—"}</td>
                    <td className="tabular px-2.5 py-2.5">{isoParaDataBr(f.admissao) || "—"}</td>
                    <td className="px-2.5 py-2.5">{situacao(f)}</td>
                    <td className="px-1 py-1.5">
                      <div className="flex flex-col items-start">{acoes(f)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="m-0 flex list-none flex-col gap-2 p-0 md:hidden">
            {visiveis.map((f) => (
              <li key={f.id} className="flex flex-col gap-1 rounded-[10px] border border-line bg-surface p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-[700] text-heading">{f.nome}</span>
                  {situacao(f)}
                </div>
                <span className="tabular text-[12.5px] text-muted">
                  {cpfOculto(f.documento)} · nasc. {isoParaDataBr(f.nascimento) || "—"}
                </span>
                <span className="text-[12.5px] text-texto">
                  {[f.cargo, capitalDe(f) !== "—" ? capitalDe(f) : null, f.setor, f.gestor].filter(Boolean).join(" · ") || "—"}
                </span>
                <div className="flex flex-wrap gap-1">{acoes(f)}</div>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="m-0 text-[12.5px] text-muted">
        Colunas iguais ao modelo de importação: Nome · CPF · Nascimento · Cargo · Salário · Setor · Gestor responsável ·
        Admissão. O capital vem da apólice. Demitir mantém o histórico; readmitir reativa o mesmo CPF.
      </p>

      {editando ? (
        <JanelaCadastro
          clienteId={clienteId}
          editando={editando}
          sugestoes={{ setor: opcoes("setor"), gestor: opcoes("gestor"), cargo: opcoes("cargo") }}
          onFechar={() => setEditando(null)}
          onSalvo={(msg) => {
            setEditando(null);
            aviso.mostrar(msg);
            router.refresh();
          }}
        />
      ) : null}

      {demitindo ? (
        <JanelaDemissao
          clienteId={clienteId}
          funcionario={demitindo}
          onFechar={() => setDemitindo(null)}
          onSalvo={() => {
            setDemitindo(null);
            aviso.mostrar(`${demitindo.nome} demitido. Fica no histórico.`);
            router.refresh();
          }}
        />
      ) : null}

      {importando ? (
        <JanelaImportacao
          clienteId={clienteId}
          onFechar={() => setImportando(false)}
          onFeito={(msg) => {
            setImportando(false);
            aviso.mostrar(msg);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function Filtro({
  rotulo,
  valor,
  opcoes,
  onMudar,
}: {
  rotulo: string;
  valor: string;
  opcoes: string[];
  onMudar: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-[600] font-(family-name:--font-display) text-heading">{rotulo}</span>
      <select
        value={valor}
        onChange={(e) => onMudar(e.target.value)}
        className="h-[42px] w-full rounded-[6px] border border-line-strong bg-surface px-3 text-[16px] text-texto sm:text-[14px]"
      >
        <option value="">Todos</option>
        {opcoes.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

async function enviarJson(url: string, metodo: string, corpo: unknown) {
  const resposta = await fetch(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  const json = await resposta.json().catch(() => null);
  const lista = json?.error?.fields as { campo: string; mensagem: string }[] | undefined;
  const campo = json?.error?.field as string | undefined;
  return {
    ok: resposta.ok,
    mensagem: (json?.error?.message as string | undefined) ?? "Não foi possível salvar.",
    erros: lista?.length
      ? Object.fromEntries(lista.map((e) => [e.campo, e.mensagem]))
      : campo
        ? { [campo]: json.error.message as string }
        : {},
  };
}

function JanelaCadastro({
  clienteId,
  editando,
  sugestoes,
  onFechar,
  onSalvo,
}: {
  clienteId: string;
  editando: { id: string | null; form: Form; titulo: string };
  sugestoes: { setor: string[]; gestor: string[]; cargo: string[] };
  onFechar: () => void;
  onSalvo: (mensagem: string) => void;
}) {
  const [form, setForm] = useState<Form>(editando.form);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const mudar = (campo: keyof Form, valor: string) => setForm((f) => ({ ...f, [campo]: valor }));

  async function salvar() {
    const analise = validar(esquemaFuncionario, form);
    if (!analise.ok) {
      setErros(porCampo(analise.erros));
      return;
    }
    setSalvando(true);
    const url = editando.id
      ? `/api/v1/clientes/${clienteId}/funcionarios/${editando.id}`
      : `/api/v1/clientes/${clienteId}/funcionarios`;
    try {
      const r = await enviarJson(url, editando.id ? "PATCH" : "POST", form);
      if (!r.ok) {
        setErros({ ...r.erros, geral: Object.keys(r.erros).length ? "" : r.mensagem });
        return;
      }
      onSalvo(editando.id ? "Funcionário salvo." : `${form.nome} cadastrado.`);
    } catch {
      setErros({ geral: "Não foi possível falar com o servidor." });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      aberto
      titulo={editando.titulo}
      onFechar={onFechar}
      largura="larga"
      acoes={
        <>
          <Botao variante="texto" onClick={onFechar}>
            Cancelar
          </Botao>
          <Botao onClick={() => void salvar()} disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar"}
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid items-start gap-3 sm:grid-cols-2">
          <Campo rotulo="Nome completo" value={form.nome} onChange={(e) => mudar("nome", e.target.value)} erro={erros.nome} required />
          <Campo
            rotulo="CPF"
            value={form.documento}
            onChange={(e) => mudar("documento", mascararDocumento(e.target.value))}
            erro={erros.documento}
            inputMode="numeric"
            placeholder="000.000.000-00"
          />
        </div>
        <div className="grid items-start gap-3 sm:grid-cols-3">
          <Campo
            rotulo="Nascimento"
            value={form.nascimento}
            onChange={(e) => mudar("nascimento", mascararData(e.target.value))}
            erro={erros.nascimento}
            inputMode="numeric"
            placeholder="dd/mm/aaaa"
          />
          <Campo rotulo="Cargo" value={form.cargo} onChange={(e) => mudar("cargo", e.target.value)} erro={erros.cargo} list="sugestoes-cargo" dica="Define o capital, quando a apólice é por cargo." />
          <Campo
            rotulo="Admissão"
            value={form.admissao}
            onChange={(e) => mudar("admissao", mascararData(e.target.value))}
            erro={erros.admissao}
            inputMode="numeric"
            placeholder="dd/mm/aaaa"
          />
        </div>
        <div className="grid items-start gap-3 sm:grid-cols-3">
          <Campo
            rotulo="Salário"
            value={form.salario}
            onChange={(e) => mudar("salario", mascararMoeda(e.target.value))}
            erro={erros.salario}
            inputMode="numeric"
            placeholder="R$ 0,00"
          />
          <Campo rotulo="Setor" value={form.setor} onChange={(e) => mudar("setor", e.target.value)} erro={erros.setor} list="sugestoes-setor" placeholder="Pode ficar em branco" />
          <Campo rotulo="Gestor responsável" value={form.gestor} onChange={(e) => mudar("gestor", e.target.value)} erro={erros.gestor} list="sugestoes-gestor" placeholder="Pode ficar em branco" />
        </div>
        {(["setor", "gestor", "cargo"] as const).map((c) => (
          <datalist key={c} id={`sugestoes-${c}`}>
            {sugestoes[c].map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        ))}
        {erros.geral ? (
          <p role="alert" className="m-0 text-[12.5px] text-bad">
            {erros.geral}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

function JanelaDemissao({
  clienteId,
  funcionario,
  onFechar,
  onSalvo,
}: {
  clienteId: string;
  funcionario: Funcionario;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [saida, setSaida] = useState("");
  const [motivo, setMotivo] = useState("Demissão");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);

  async function demitir() {
    const analise = validar(esquemaDemissao, { saida, motivo });
    if (!analise.ok) {
      setErros(porCampo(analise.erros));
      return;
    }
    setSalvando(true);
    try {
      const r = await enviarJson(`/api/v1/clientes/${clienteId}/funcionarios/${funcionario.id}/demissao`, "POST", { saida, motivo });
      if (!r.ok) {
        setErros({ ...r.erros, geral: Object.keys(r.erros).length ? "" : r.mensagem });
        return;
      }
      onSalvo();
    } catch {
      setErros({ geral: "Não foi possível falar com o servidor." });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      aberto
      titulo="Demitir funcionário"
      onFechar={onFechar}
      acoes={
        <>
          <Botao variante="texto" onClick={onFechar}>
            Cancelar
          </Botao>
          <Botao variante="perigo" onClick={() => void demitir()} disabled={salvando}>
            {salvando ? "Demitindo…" : "Demitir"}
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="m-0 text-[13.5px] text-texto">
          <b className="font-[600]">{funcionario.nome}</b> sai da cobertura. A vida fica no histórico e pode ser readmitida
          com o mesmo CPF.
        </p>
        <div className="grid items-start gap-3 sm:grid-cols-2">
          <Campo
            rotulo="Data de saída"
            value={saida}
            onChange={(e) => setSaida(mascararData(e.target.value))}
            erro={erros.saida}
            inputMode="numeric"
            placeholder="dd/mm/aaaa"
            required
          />
          <Campo rotulo="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} erro={erros.motivo} />
        </div>
        {erros.geral ? (
          <p role="alert" className="m-0 text-[12.5px] text-bad">
            {erros.geral}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

type Previa = {
  aba?: string;
  novos: number;
  atualizar: number;
  readmitir: number;
  ignorados: { linha: number; motivo: string }[];
  totalIgnorados: number;
};

function JanelaImportacao({
  clienteId,
  onFechar,
  onFeito,
}: {
  clienteId: string;
  onFechar: () => void;
  onFeito: (mensagem: string) => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(escolhido: File, confirmar: boolean) {
    setOcupado(true);
    setErro(null);
    try {
      const corpo = new FormData();
      corpo.append("arquivo", escolhido);
      if (confirmar) corpo.append("confirmar", "1");
      const resposta = await fetch(`/api/v1/clientes/${clienteId}/funcionarios/importacao`, { method: "POST", body: corpo });
      const json = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        setErro(json?.error?.message ?? "Não foi possível ler a planilha.");
        return;
      }
      if (confirmar) {
        onFeito(`${json.data.incluidos} incluídos, ${json.data.atualizados} atualizados.`);
      } else {
        setPrevia(json.data as Previa);
      }
    } catch {
      setErro("Não foi possível falar com o servidor.");
    } finally {
      setOcupado(false);
    }
  }

  const muda = previa ? previa.novos + previa.atualizar + previa.readmitir : 0;

  return (
    <Modal
      aberto
      titulo="Importar planilha de funcionários"
      onFechar={onFechar}
      largura="larga"
      acoes={
        <>
          <Botao variante="texto" onClick={onFechar}>
            Cancelar
          </Botao>
          <Botao onClick={() => arquivo && void enviar(arquivo, true)} disabled={!previa || !muda || ocupado}>
            {ocupado && previa ? "Importando…" : "Importar"}
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="m-0 text-[13px] text-muted">
          Colunas reconhecidas: Nome · CPF · Nascimento · Cargo · Salário · Setor · Gestor responsável · Admissão. Aceita a
          planilha que o cliente já usa, com os nomes de coluna dele.
        </p>
        <button
          type="button"
          onClick={() => entrada.current?.click()}
          disabled={ocupado}
          className="flex flex-col items-center gap-1 rounded-[8px] border-2 border-dashed border-line bg-surface-2 px-4 py-6 text-center"
        >
          <b className="text-[14px] font-[600] text-heading">
            {ocupado && !previa ? "Lendo…" : arquivo ? arquivo.name : "Escolher a planilha"}
          </b>
          <span className="text-[12.5px] text-muted">xlsx ou csv</span>
        </button>
        <input
          ref={entrada}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const escolhido = e.target.files?.[0];
            e.target.value = "";
            if (!escolhido) return;
            setArquivo(escolhido);
            setPrevia(null);
            void enviar(escolhido, false);
          }}
        />
        {erro ? (
          <p role="alert" className="m-0 text-[12.5px] text-bad">
            {erro}
          </p>
        ) : null}
        {previa ? (
          <div className="flex flex-col gap-2 rounded-[8px] border border-line p-3 text-[13px]">
            <p className="m-0 text-texto">
              <b className="font-[600]">{previa.novos}</b> novos · <b className="font-[600]">{previa.atualizar}</b> atualizados ·{" "}
              <b className="font-[600]">{previa.readmitir}</b> readmitidos
              {previa.totalIgnorados ? ` · ${previa.totalIgnorados} linhas ignoradas` : ""}
              {previa.aba ? <span className="text-muted"> (aba “{previa.aba}”)</span> : null}
            </p>
            <p className="m-0 text-[12.5px] text-muted">
              Atualizar só troca o que a planilha traz preenchido. Quem não está na planilha não é demitido.
            </p>
            {previa.ignorados.length ? (
              <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-[12.5px] text-texto">
                {previa.ignorados.map((i) => (
                  <li key={i.linha}>
                    Linha {i.linha}: {i.motivo}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

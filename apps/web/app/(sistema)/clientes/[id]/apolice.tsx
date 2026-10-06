"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Botao } from "@/componentes/ui/botao";
import { Campo, Selecao } from "@/componentes/ui/campo";
import { useAviso } from "@/componentes/ui/aviso";
import {
  APOLICE_VAZIA,
  esquemaApoliceDoCadastro,
  FORMAS_DE_CAPITAL,
  ROTULO_FORMA,
  type ApoliceNoFormulario,
  type FormaDeCapital,
} from "@/lib/dominio/apolice";
import { mascararData } from "@/lib/dominio/mascaras";
import { porCampo, validar } from "@/lib/dominio/validar";

/**
 * O bloco "Apólice" da ficha, no padrão do MX Sinistro: a analista arrasta o
 * PDF, o agente preenche, os campos lidos ficam em azul com ✦ até ela revisar,
 * e só o "Salvar apólice" grava. A IA nunca salva.
 */

type Leitura = {
  ilegivel: string[];
  segurado: string | null;
  seguradora: string | null;
  outroSegurado: boolean | null;
  execucaoId: number | null;
  doCache: boolean;
};

type Campo = keyof ApoliceNoFormulario;

export function BlocoDaApolice({
  clienteId,
  inicial,
  pdfNome,
  situacao,
}: {
  clienteId: string;
  inicial: ApoliceNoFormulario | null;
  pdfNome: string | null;
  situacao: { disponivel: boolean; motivo: "sem_chave" | "teto" | null };
}) {
  const router = useRouter();
  const aviso = useAviso();
  const entrada = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<ApoliceNoFormulario>(inicial ?? APOLICE_VAZIA);
  const [lidos, setLidos] = useState<Set<Campo>>(new Set());
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [leitura, setLeitura] = useState<Leitura | null>(null);
  const [lendo, setLendo] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});

  const mudar = (campo: Campo, valor: ApoliceNoFormulario[Campo]) => {
    setForm((f) => ({ ...f, [campo]: valor }));
    // Mexeu, revisou: o destaque sai daquele campo.
    setLidos((s) => {
      const novo = new Set(s);
      novo.delete(campo);
      return novo;
    });
  };

  async function ler(pdf: File) {
    setErro(null);
    setArquivo(pdf);
    if (!situacao.disponivel) return;
    setLendo(true);
    try {
      const corpo = new FormData();
      corpo.append("arquivo", pdf);
      const resposta = await fetch(`/api/v1/clientes/${clienteId}/apolice/leitura`, { method: "POST", body: corpo });
      const json = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        setErro(`${json?.error?.message ?? "Não foi possível ler a apólice."} Você pode preencher os campos à mão.`);
        return;
      }
      const lido = json.data.formulario as ApoliceNoFormulario;
      // Só entra o que o agente achou; o que ele não achou fica como estava.
      const preenchidos = (Object.keys(lido) as Campo[]).filter((c) => {
        const v = lido[c];
        return Array.isArray(v) ? v.length > 0 : c === "forma" ? v !== "nao_consta" : v !== "";
      });
      setForm((f) => ({ ...f, ...Object.fromEntries(preenchidos.map((c) => [c, lido[c]])) }));
      setLidos(new Set(preenchidos));
      setLeitura(json.data as Leitura);
    } catch {
      setErro("Não foi possível falar com o servidor. Você pode preencher os campos à mão.");
    } finally {
      setLendo(false);
    }
  }

  async function salvar() {
    const dados = { ...form, execucaoId: leitura?.execucaoId ?? null };
    const analise = validar(esquemaApoliceDoCadastro, dados);
    if (!analise.ok) {
      setErros(porCampo(analise.erros));
      return;
    }
    setErros({});
    setSalvando(true);
    try {
      const corpo = new FormData();
      corpo.append("dados", JSON.stringify(dados));
      if (arquivo) corpo.append("arquivo", arquivo);
      const resposta = await fetch(`/api/v1/clientes/${clienteId}/apolice`, { method: "PUT", body: corpo });
      const json = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        const lista = json?.error?.fields as { campo: string; mensagem: string }[] | undefined;
        if (lista?.length) setErros(Object.fromEntries(lista.map((e) => [e.campo, e.mensagem])));
        setErro(json?.error?.message ?? "Não foi possível salvar a apólice.");
        return;
      }
      aviso.mostrar("Apólice salva.");
      setLidos(new Set());
      setArquivo(null);
      router.refresh();
    } catch {
      setErro("Não foi possível falar com o servidor.");
    } finally {
      setSalvando(false);
    }
  }

  const rot = (texto: string, campo: Campo) => (lidos.has(campo) ? `${texto} ✦` : texto);
  const ia = (campo: Campo) => lidos.has(campo);

  return (
    <section className="flex flex-col gap-4 rounded-[10px] border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-1">
        <h2 className="m-0 font-(family-name:--font-display) text-[16px] font-[600] text-heading">Apólice</h2>
        {lidos.size ? (
          <p className="m-0 text-[12.5px] text-muted">
            Campos com ✦ vieram do PDF da apólice. Confira e corrija o que precisar antes de salvar.
          </p>
        ) : null}
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          const pdf = e.dataTransfer.files?.[0];
          if (pdf && !lendo) void ler(pdf);
        }}
        className={`flex flex-wrap items-center gap-3 rounded-[8px] border-2 border-dashed px-3 py-3 ${
          arrastando ? "border-brand bg-ia-soft" : "border-line bg-surface-2"
        }`}
      >
        <input
          ref={entrada}
          type="file"
          accept="application/pdf"
          aria-label="Apólice em PDF"
          className="sr-only"
          onChange={(e) => {
            const pdf = e.target.files?.[0];
            if (pdf) void ler(pdf);
            e.target.value = "";
          }}
        />
        <Botao variante="secundario" onClick={() => entrada.current?.click()} disabled={lendo}>
          {lendo ? "Lendo…" : arquivo || pdfNome ? "Trocar apólice" : "Escolher apólice"}
        </Botao>
        <div className="min-w-0 flex-1 basis-full sm:basis-0">
          <p className="m-0 text-[13px] font-[600] text-heading">
            {arquivo ? arquivo.name : pdfNome ?? "Apólice PDF"}{" "}
            <span className="font-[400] text-muted">
              {arquivo ? "— será anexada ao salvar" : pdfNome ? "— anexada" : "— preenchimento automático"}
            </span>
          </p>
          <p className="m-0 text-[12.5px] text-muted">
            {!situacao.disponivel
              ? situacao.motivo === "sem_chave"
                ? "A leitura automática está desligada — falta a chave da IA. O cadastro à mão continua valendo."
                : "O limite diário de leitura automática foi atingido. Hoje, preencha os campos à mão."
              : "Arraste a apólice aqui ou escolha o arquivo: o agente lê número, vigência, capital, taxa e limite de idade."}
          </p>
        </div>
      </div>

      {erro ? (
        <p role="alert" className="m-0 text-[12.5px] text-bad">
          {erro}
        </p>
      ) : null}

      {leitura ? (
        <div className="flex flex-col gap-1 text-[12.5px]">
          {leitura.outroSegurado ? (
            <p role="alert" className="m-0 rounded-[6px] bg-bad-soft px-2.5 py-1.5 font-[600] text-bad">
              Esta apólice é de outro CNPJ{leitura.segurado ? ` (${leitura.segurado})` : ""}. Confira se o arquivo é
              deste cliente antes de salvar.
            </p>
          ) : null}
          {leitura.doCache ? (
            <p className="m-0 text-muted">Esta apólice já tinha sido lida — o resultado foi reaproveitado, sem custo.</p>
          ) : null}
          {leitura.ilegivel.length ? (
            <p className="m-0 text-muted">Não constavam no documento: {leitura.ilegivel.join("; ")}.</p>
          ) : null}
        </div>
      ) : null}

      <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo rotulo={rot("Nº da apólice", "numero")} value={form.numero} onChange={(e) => mudar("numero", e.target.value)} erro={erros.numero} destacado={ia("numero")} required />
        <Campo rotulo={rot("Nº do contrato", "contrato")} value={form.contrato} onChange={(e) => mudar("contrato", e.target.value)} erro={erros.contrato} destacado={ia("contrato")} />
        <Campo rotulo={rot("Produto", "produto")} value={form.produto} onChange={(e) => mudar("produto", e.target.value)} erro={erros.produto} destacado={ia("produto")} />
        <Campo
          rotulo={rot("Limite de idade", "limiteDeIdade")}
          value={form.limiteDeIdade}
          onChange={(e) => mudar("limiteDeIdade", e.target.value.replace(/\D/g, "").slice(0, 3))}
          erro={erros.limiteDeIdade}
          destacado={ia("limiteDeIdade")}
          inputMode="numeric"
          dica="para inclusão"
        />
        <Campo
          rotulo={rot("Vigência · início", "vigenciaInicio")}
          value={form.vigenciaInicio}
          onChange={(e) => mudar("vigenciaInicio", mascararData(e.target.value))}
          erro={erros.vigenciaInicio}
          destacado={ia("vigenciaInicio")}
          placeholder="dd/mm/aaaa"
          inputMode="numeric"
        />
        <Campo
          rotulo={rot("Vigência · fim", "vigenciaFim")}
          value={form.vigenciaFim}
          onChange={(e) => mudar("vigenciaFim", mascararData(e.target.value))}
          erro={erros.vigenciaFim}
          destacado={ia("vigenciaFim")}
          placeholder="dd/mm/aaaa"
          inputMode="numeric"
        />
        <Campo
          rotulo={rot("Taxa média (‰)", "taxaPorMil")}
          value={form.taxaPorMil}
          onChange={(e) => mudar("taxaPorMil", e.target.value.replace(/[^\d,]/g, ""))}
          erro={erros.taxaPorMil}
          destacado={ia("taxaPorMil")}
          inputMode="decimal"
          dica="usada no prêmio previsto"
        />
        <Selecao
          rotulo={rot("Capital segurado", "forma")}
          vazio={null}
          opcoes={FORMAS_DE_CAPITAL.map((f) => ({ valor: f, rotulo: ROTULO_FORMA[f] }))}
          value={form.forma}
          onChange={(e) => {
            const forma = e.target.value as FormaDeCapital;
            mudar("forma", forma);
            if ((forma === "por_cargo" || forma === "por_cobertura") && !form.faixas.length) {
              setForm((f) => ({ ...f, forma, faixas: [{ rotulo: "", capital: "" }] }));
            }
          }}
          destacado={ia("forma")}
        />
      </div>

      {form.forma === "por_cargo" || form.forma === "por_cobertura" ? (
        <div className="flex flex-col gap-2.5">
          {form.faixas.map((f, i) => (
            <div key={i} className="grid items-start gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <Campo
                rotulo={form.forma === "por_cargo" ? "Cargo" : "Cobertura"}
                value={f.rotulo}
                onChange={(e) => mudar("faixas", form.faixas.map((x, j) => (j === i ? { ...x, rotulo: e.target.value } : x)))}
                erro={erros[`faixas.${i}.rotulo`]}
                destacado={ia("faixas")}
              />
              <Campo
                rotulo="Capital (R$)"
                value={f.capital}
                onChange={(e) =>
                  mudar("faixas", form.faixas.map((x, j) => (j === i ? { ...x, capital: e.target.value.replace(/[^\d,.]/g, "") } : x)))
                }
                erro={erros[`faixas.${i}.capital`]}
                destacado={ia("faixas")}
                inputMode="decimal"
              />
              <div className="sm:mt-[26px]">
                <Botao variante="texto" onClick={() => mudar("faixas", form.faixas.filter((_, j) => j !== i))}>
                  Remover
                </Botao>
              </div>
            </div>
          ))}
          {erros.faixas ? <p className="m-0 text-[12.5px] text-bad">{erros.faixas}</p> : null}
          <div>
            <Botao variante="secundario" onClick={() => mudar("faixas", [...form.faixas, { rotulo: "", capital: "" }])}>
              + Adicionar faixa
            </Botao>
          </div>
        </div>
      ) : null}

      {form.forma === "per_capita" ? (
        <div className="grid gap-3 sm:grid-cols-4">
          <Campo rotulo={rot("Capital por pessoa (R$)", "valor")} value={form.valor} onChange={(e) => mudar("valor", e.target.value.replace(/[^\d,.]/g, ""))} erro={erros.valor} destacado={ia("valor")} inputMode="decimal" />
        </div>
      ) : null}

      {form.forma === "multiplo_salarial" ? (
        <div className="grid gap-3 sm:grid-cols-4">
          <Campo rotulo={rot("Múltiplo do salário", "multiplo")} value={form.multiplo} onChange={(e) => mudar("multiplo", e.target.value.replace(/[^\d,]/g, ""))} erro={erros.multiplo} destacado={ia("multiplo")} inputMode="decimal" />
        </div>
      ) : null}

      <div className="flex justify-end border-t border-line pt-4">
        <Botao onClick={() => void salvar()} disabled={salvando || lendo}>
          {salvando ? "Salvando…" : "Salvar apólice"}
        </Botao>
      </div>
    </section>
  );
}

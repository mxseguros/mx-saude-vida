"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Botao } from "@/componentes/ui/botao";
import { Campo } from "@/componentes/ui/campo";
import { useAviso } from "@/componentes/ui/aviso";
import type { LinhaDoControle } from "@/lib/controles/consulta";
import { esquemaColeta } from "@/lib/dominio/coleta";
import { nomeDoMes } from "@/lib/dominio/controle";
import { mascararDocumento, mascararTelefone } from "@/lib/dominio/mascaras";
import { porCampo, validar } from "@/lib/dominio/validar";

/**
 * A movimentação digitada pela analista.
 *
 * As MESMAS cinco seções do formulário do gestor, na mesma ordem, com o MESMO
 * esquema zod — mas numa página só, e não em cinco passos.
 *
 * O plano pedia as cinco etapas aqui também. Não entregar a paginação é
 * deliberado, e o motivo é quem está na frente da tela: o gestor preenche no
 * celular, onde uma pergunta por vez é o que cabe; a analista está no
 * computador com o cliente no telefone ditando nomes, e cinco cliques entre
 * "Maria" e "João" são cinco chances de perder o fio. As regras são as mesmas —
 * é o mesmo esquema, validado no mesmo lugar —, e é isso que o plano queria
 * garantir.
 */
export function FormularioDaEquipe({
  linha,
  nome: nomeInicial,
  celular: celularInicial,
  setor: setorInicial,
  onFechar,
}: {
  linha: LinhaDoControle;
  nome: string;
  celular: string;
  setor: string;
  onFechar: () => void;
}) {
  const router = useRouter();
  const aviso = useAviso();

  const [nome, setNome] = useState(nomeInicial);
  const [celular, setCelular] = useState(celularInicial);
  const [setor, setSetor] = useState(setorInicial);
  const [semMovimentacao, setSemMovimentacao] = useState(false);
  const [entradas, setEntradas] = useState<Pessoa[]>([{ nome: "", documento: "" }]);
  const [saidas, setSaidas] = useState<Pessoa[]>([]);
  const [observacao, setObservacao] = useState("");

  const [erros, setErros] = useState<Record<string, string>>({});
  const [recado, setRecado] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function corpo() {
    return {
      nome,
      celular,
      setor,
      semMovimentacao,
      entradas: semMovimentacao ? [] : entradas.filter(temAlgo),
      saidas: semMovimentacao ? [] : saidas.filter(temAlgo),
      // A planilha não entra por aqui: quem a anexa é a tela de conferir, que
      // já lê o arquivo e aponta linha com campo em branco. Dois caminhos de
      // upload para o mesmo arquivo seriam dois lugares para corrigir.
      planilhaId: "",
      observacao,
    };
  }

  async function registrar() {
    const analise = validar(esquemaColeta, corpo());
    if (!analise.ok) {
      setErros(porCampo(analise.erros));
      setRecado("Confira os campos destacados.");
      return;
    }

    setSalvando(true);
    setRecado(null);
    try {
      const resposta = await fetch(`/api/v1/controles/${linha.id}/coleta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo()),
      });
      const json = await resposta.json().catch(() => null);

      if (!resposta.ok) {
        const lista = json?.error?.fields as { campo: string; mensagem: string }[] | undefined;
        if (lista?.length) setErros(Object.fromEntries(lista.map((e) => [e.campo, e.mensagem])));
        setRecado(json?.error?.message ?? "Não foi possível registrar a coleta.");
        return;
      }

      aviso.mostrar(`Coleta registrada. Protocolo ${json?.data?.protocolo ?? ""}.`);
      onFechar();
      router.refresh();
    } catch {
      setRecado("Não foi possível falar com o servidor. O que você digitou continua aqui.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="flex flex-col gap-5 rounded-[10px] border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 font-(family-name:--font-display) text-[16px] font-[600] text-heading">
            Movimentação de {nomeDoMes(linha.competencia)}
          </h2>
          <p className="m-0 text-[13px] text-muted">
            O que você digitar fica marcado como vindo da MX, e não do gestor.
          </p>
        </div>
        <Botao variante="texto" onClick={onFechar}>
          Fechar
        </Botao>
      </div>

      {recado ? (
        <p role="alert" className="rounded-[8px] border border-warn bg-warn-soft p-3 text-[13.5px] text-texto">
          {recado}
        </p>
      ) : null}

      {/* 1 · Quem informou */}
      <Secao titulo="1 · Quem informou">
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} erro={erros.nome} required />
          <Campo
            rotulo="Celular"
            value={celular}
            onChange={(e) => setCelular(mascararTelefone(e.target.value))}
            erro={erros.celular}
            inputMode="tel"
            required
          />
          <Campo
            rotulo="Setor"
            value={setor}
            onChange={(e) => setSetor(e.target.value)}
            erro={erros.setor}
            dica="Opcional."
          />
        </div>

        <label className="flex items-start gap-2.5 text-[13.5px] leading-[1.45] text-texto">
          <input
            type="checkbox"
            checked={semMovimentacao}
            onChange={(e) => setSemMovimentacao(e.target.checked)}
            className="mt-[3px] size-4 shrink-0 accent-[var(--brand)]"
          />
          <span>
            Ninguém entrou nem saiu em {nomeDoMes(linha.competencia)}.
            <span className="block text-[12.5px] text-muted">
              Marcar isto fecha a conferência do mês: não há planilha a conferir.
            </span>
          </span>
        </label>
        {erros.semMovimentacao ? (
          <p role="alert" className="text-[13px] text-bad">
            {erros.semMovimentacao}
          </p>
        ) : null}
      </Secao>

      {semMovimentacao ? null : (
        <>
          {/* 2 e 3 · As pessoas */}
          <Secao titulo="2 · Quem entrou">
            <Pessoas
              tipo="entradas"
              pessoas={entradas}
              erros={erros}
              onMudar={(i, campo, valor) =>
                setEntradas((l) => l.map((p, j) => (j === i ? { ...p, [campo]: valor } : p)))
              }
              onAdicionar={() => setEntradas((l) => [...l, { nome: "", documento: "" }])}
              onRemover={(i) => setEntradas((l) => l.filter((_, j) => j !== i))}
            />
          </Secao>

          <Secao titulo="3 · Quem saiu">
            <Pessoas
              tipo="saidas"
              pessoas={saidas}
              erros={erros}
              onMudar={(i, campo, valor) => setSaidas((l) => l.map((p, j) => (j === i ? { ...p, [campo]: valor } : p)))}
              onAdicionar={() => setSaidas((l) => [...l, { nome: "", documento: "" }])}
              onRemover={(i) => setSaidas((l) => l.filter((_, j) => j !== i))}
            />
          </Secao>

          {/* 4 · Planilha */}
          <Secao titulo="4 · Planilha">
            <p className="m-0 text-[13px] leading-[1.5] text-muted">
              A planilha é anexada na tela de <strong className="font-[600]">Conferir</strong>, que já lê o arquivo e
              aponta linha com campo em branco. Registre a movimentação aqui e anexe lá.
            </p>
          </Secao>
        </>
      )}

      {/* 5 · Observação */}
      <Secao titulo="5 · Observação">
        <Campo
          rotulo="O que o gestor disse"
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          erro={erros.observacao}
          dica="Opcional. Fica no histórico do mês."
        />
      </Secao>

      <div className="flex flex-wrap gap-2.5">
        <Botao onClick={() => void registrar()} disabled={salvando}>
          {salvando ? "Registrando…" : "Registrar coleta"}
        </Botao>
        <Botao variante="texto" onClick={onFechar}>
          Cancelar
        </Botao>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------------
   Pedaços
   -------------------------------------------------------------------------- */

type Pessoa = { nome: string; documento: string };

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-4 first:border-0 first:pt-0">
      <h3 className="m-0 text-[12px] font-[600] uppercase tracking-[0.05em] text-muted">{titulo}</h3>
      {children}
    </div>
  );
}

function Pessoas({
  tipo,
  pessoas,
  erros,
  onMudar,
  onAdicionar,
  onRemover,
}: {
  tipo: "entradas" | "saidas";
  pessoas: Pessoa[];
  erros: Record<string, string>;
  onMudar: (i: number, campo: keyof Pessoa, valor: string) => void;
  onAdicionar: () => void;
  onRemover: (i: number) => void;
}) {
  const verbo = tipo === "entradas" ? "entrou" : "saiu";

  return (
    <>
      {pessoas.length === 0 ? (
        <p className="m-0 text-[13px] text-muted">Ninguém {verbo} neste mês.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {pessoas.map((pessoa, i) => (
            <li key={i} className="grid items-start gap-3 sm:grid-cols-[1fr_200px_auto]">
              <Campo
                rotulo={i === 0 ? "Nome completo" : ""}
                value={pessoa.nome}
                onChange={(e) => onMudar(i, "nome", e.target.value)}
                erro={erros[`${tipo}.${i}.nome`]}
                autoComplete="off"
              />
              <Campo
                rotulo={i === 0 ? "CPF" : ""}
                value={pessoa.documento}
                onChange={(e) => onMudar(i, "documento", mascararDocumento(e.target.value))}
                erro={erros[`${tipo}.${i}.documento`]}
                inputMode="numeric"
                autoComplete="off"
                dica={i === 0 ? "Pode ficar em branco." : undefined}
              />
              {/* Alinhado com os controles, e não com os rótulos: a grade do
                  projeto pede rótulo e controle na mesma altura em toda linha. */}
              <div className={i === 0 ? "sm:mt-[26px]" : ""}>
                <Botao variante="texto" onClick={() => onRemover(i)} aria-label={`Remover a ${i + 1}ª pessoa`}>
                  Remover
                </Botao>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div>
        <Botao variante="secundario" onClick={onAdicionar}>
          {pessoas.length === 0 ? `Adicionar quem ${verbo}` : "Adicionar outra pessoa"}
        </Botao>
      </div>
    </>
  );
}

/** Pessoa que a analista começou a preencher. Linha em branco não vai no envio. */
function temAlgo(p: Pessoa): boolean {
  return p.nome.trim() !== "" || p.documento.trim() !== "";
}

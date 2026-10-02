"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Botao } from "@/componentes/ui/botao";
import { Campo } from "@/componentes/ui/campo";
import { Modal } from "@/componentes/ui/modal";
import { Aviso, useAviso } from "@/componentes/ui/aviso";
import { emMegabytes } from "@/lib/dominio/arquivo";
import { formatarMoeda, mascararDocumento } from "@/lib/dominio/mascaras";
import { nomeDoMes, type Passo } from "@/lib/dominio/controle";
import { ROTULO_COLUNA, type ColunaDaPlanilha, type LinhaDaPlanilha } from "@/lib/dominio/planilha";
import type { PlanilhaDoMes } from "@/lib/controles/consulta";

/**
 * A conferência: a prévia das linhas e as duas saídas.
 *
 * A prévia é carregada aqui, e não no servidor, porque abrir um xlsx de mil
 * linhas leva tempo — a página aparece com o contexto e a tabela chega depois.
 * Com a leitura no servidor, a analista olharia uma tela branca sem saber se
 * clicou.
 *
 * Campo em branco ou inválido NÃO impede conferir. A planilha do cliente quase
 * sempre tem uma lacuna que a analista já resolveu por telefone, e barrar por
 * isso a obrigaria a pedir reenvio de um arquivo que estava bom.
 */

type Previa = {
  semMudancas: boolean;
  planilha: PlanilhaDoMes | null;
  aba?: string;
  abas?: string[];
  cabecalhoNaLinha?: number | null;
  colunasAusentes?: ColunaDaPlanilha[];
  total: number;
  comProblema: number;
  repetidos?: number;
  linhas: LinhaDaPlanilha[];
  cortada?: boolean;
  motivo?: string;
};

/** As colunas da prévia, na ordem do modelo de importação. */
const COLUNAS: ColunaDaPlanilha[] = ["nome", "cpf", "nascimento", "cargo", "capital", "setor", "gestor", "admissao"];

export function Conferencia({
  controleId,
  cliente,
  competencia,
  passo,
  semMudancas,
  planilha,
  podeDecidir,
}: {
  controleId: string;
  cliente: string;
  competencia: string;
  passo: Passo;
  semMudancas: boolean;
  planilha: PlanilhaDoMes | null;
  podeDecidir: boolean;
}) {
  const router = useRouter();
  const aviso = useAviso();

  const [previa, setPrevia] = useState<Previa | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroPrevia, setErroPrevia] = useState<string | null>(null);

  const [observacao, setObservacao] = useState("");
  const [pedindo, setPedindo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const mes = nomeDoMes(competencia);

  useEffect(() => {
    let vivo = true;

    (async () => {
      try {
        const resposta = await fetch(`/api/v1/controles/${controleId}/previa`);
        const json = await resposta.json().catch(() => null);
        if (!vivo) return;

        if (!resposta.ok) {
          setErroPrevia(json?.error?.message ?? "Não foi possível abrir a planilha.");
          return;
        }
        setPrevia(json.data as Previa);
      } catch {
        if (vivo) setErroPrevia("Não foi possível falar com o servidor.");
      } finally {
        if (vivo) setCarregando(false);
      }
    })();

    // A tela pode ser fechada antes da leitura terminar: sem isto, o `setState`
    // cairia num componente desmontado.
    return () => {
      vivo = false;
    };
  }, [controleId]);

  async function decidir(acao: "conferir" | "pedir_correcao" | "sem_movimentacao") {
    setErro(null);
    setSalvando(true);

    try {
      const resposta = await fetch(`/api/v1/controles/${controleId}/conferir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao,
          observacao: observacao.trim() || null,
          motivo: acao === "pedir_correcao" ? motivo.trim() : null,
        }),
      });
      const json = await resposta.json().catch(() => null);

      if (!resposta.ok) {
        setErro(json?.error?.message ?? "Não foi possível salvar.");
        return;
      }

      if (acao === "pedir_correcao") {
        aviso.mostrar(`Correção pedida. ${cliente} voltou para "informar" — envie a mensagem pelo Controle.`);
        setPedindo(false);
        router.push("/controle");
      } else {
        aviso.mostrar(`${cliente} conferido. O mês seguiu para o corte.`);
        router.push("/controle");
      }
      router.refresh();
    } catch {
      setErro("Não foi possível falar com o servidor.");
    } finally {
      setSalvando(false);
    }
  }

  /* ---------------------------------------------------------- sem planilha */
  if (!carregando && (previa?.semMudancas || semMudancas)) {
    return (
      <>
        <div className="rounded-[10px] border border-line bg-surface p-5">
          <p className="font-(family-name:--font-display) text-[15px] font-[700] text-heading">
            O cliente informou que não houve mudanças em {mes}
          </p>
          <p className="mt-1.5 max-w-[60ch] text-[13.5px] leading-relaxed text-muted">
            Não há planilha a conferir — o mês já seguiu adiante sozinho. Se você souber de alguma entrada ou saída,
            peça a planilha pelo WhatsApp e use “Pedir correção”.
          </p>
        </div>
        {podeDecidir ? <Decisoes /> : null}
        <Aviso estado={aviso.estado} onFechar={aviso.fechar} />
      </>
    );
  }

  return (
    <>
      {/* A ficha do arquivo: quem mandou, quando, e por onde. "Enviada pelo
          portal" contra "anexada pela MX" muda o que a analista espera dela. */}
      {planilha ? (
        <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-line bg-surface p-3.5">
          <span
            aria-hidden="true"
            className="flex h-9 w-11 shrink-0 items-center justify-center rounded-[6px] bg-ok-soft text-[10.5px] font-[700] text-ok"
          >
            XLS
          </span>
          <span className="min-w-0 flex-1">
            <b className="block truncate text-[13.5px] font-[600] text-heading">{planilha.nome}</b>
            <span className="text-[12px] text-muted">
              {planilha.tamanho ? `${emMegabytes(planilha.tamanho)} · ` : ""}
              {planilha.pelaMX ? "anexada pela MX" : "enviada pelo portal"}
              {planilha.porQuem ? ` por ${planilha.porQuem}` : ""} · {quando(planilha.enviadaEm)}
            </span>
          </span>
          <a
            href={`/api/v1/arquivos/${planilha.id}`}
            className="inline-flex min-h-[36px] items-center rounded-[6px] border border-line-strong px-3 text-[12.5px] font-[600] text-heading hover:bg-surface-2"
          >
            Baixar
          </a>
        </div>
      ) : null}

      {carregando ? (
        <p className="rounded-[10px] border border-line bg-surface-2 p-4 text-[13.5px] text-texto">
          Abrindo a planilha…
        </p>
      ) : erroPrevia ? (
        <p role="alert" className="rounded-[10px] border border-warn bg-warn-soft p-4 text-[13.5px] text-texto">
          {erroPrevia}
        </p>
      ) : previa && !previa.planilha ? (
        <div className="rounded-[10px] border border-warn bg-warn-soft p-4 text-[13.5px] leading-relaxed text-texto">
          <b className="block font-[600]">Nenhuma planilha neste mês.</b>O cliente ainda não enviou, ou o arquivo
          foi removido. Cobre pelo Controle, ou anexe a planilha que ele mandou por fora.
        </div>
      ) : previa?.motivo ? (
        <div className="rounded-[10px] border border-warn bg-warn-soft p-4 text-[13.5px] leading-relaxed text-texto">
          <b className="block font-[600]">Não consegui abrir este arquivo.</b>
          {previa.motivo} Baixe acima e confira por fora — dá para conferir o mês assim mesmo.
        </div>
      ) : previa ? (
        <>
          <div className="flex flex-wrap gap-2.5">
            <Tile valor={previa.total} rotulo={previa.total === 1 ? "vida na planilha" : "vidas na planilha"} />
            <Tile
              valor={previa.comProblema}
              rotulo={previa.comProblema === 1 ? "linha com campo a conferir" : "linhas com campo a conferir"}
              cor={previa.comProblema ? "text-warn" : undefined}
            />
            {previa.repetidos ? (
              <Tile valor={previa.repetidos} rotulo="CPF repetido na planilha" cor="text-warn" />
            ) : null}
          </div>

          {previa.colunasAusentes?.length ? (
            <p className="rounded-[8px] bg-surface-2 px-3 py-2.5 text-[12.5px] leading-relaxed text-texto">
              Esta planilha não traz {previa.colunasAusentes.map((c) => ROTULO_COLUNA[c]).join(", ")}. Não é
              impedimento — o modelo pede, mas o cliente manda o que o sistema dele exporta.
            </p>
          ) : null}

          {previa.abas && previa.abas.length > 1 ? (
            <p role="alert" className="rounded-[8px] border border-warn bg-warn-soft px-3 py-2.5 text-[13px] text-texto">
              O arquivo tem {previa.abas.length} abas e eu li a primeira (“{previa.aba}”). Grupos com vários CNPJs
              mandam uma aba por empresa — confira as outras pelo arquivo baixado.
            </p>
          ) : null}

          {previa.linhas.length ? (
            <div className="overflow-hidden rounded-[10px] border border-line bg-surface">
              <table className="w-full table-fixed border-collapse text-[12.5px]">
                <colgroup>
                  <col className="w-[5%]" />
                  <col className="w-[23%]" />
                  <col className="w-[13%]" />
                  <col className="w-[10%]" />
                  <col className="w-[12%]" />
                  <col className="w-[11%]" />
                  <col className="w-[13%]" />
                  <col className="w-[13%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-line bg-surface-2 text-left">
                    <th className="rotulo px-2.5 py-2">#</th>
                    {COLUNAS.slice(0, 7).map((coluna) => (
                      <th key={coluna} className="rotulo px-2.5 py-2">
                        {ROTULO_COLUNA[coluna]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previa.linhas.map((linha) => {
                    const problemas = new Set(linha.problemas.map((p) => p.campo));
                    return (
                      <tr
                        key={linha.numero}
                        // Linha com campo a conferir ganha fundo âmbar, não
                        // vermelho: ela não impede nada, só pede atenção.
                        className={
                          "border-b border-line align-top last:border-0 " +
                          (problemas.size ? "bg-warn-soft" : "hover:bg-surface-2")
                        }
                      >
                        <td className="tabular px-2.5 py-2 text-faint">{linha.numero}</td>
                        <Celula texto={linha.nome} problema={problemas.has("nome")} forte />
                        <Celula
                          texto={linha.cpf ? mascararDocumento(linha.cpf) : null}
                          problema={problemas.has("cpf")}
                          tabular
                        />
                        <Celula texto={dia(linha.nascimento)} problema={problemas.has("nascimento")} tabular />
                        <Celula texto={linha.cargo} />
                        <Celula
                          texto={linha.capital === null ? null : formatarMoeda(linha.capital)}
                          problema={problemas.has("capital")}
                          tabular
                        />
                        <Celula texto={linha.setor} />
                        <Celula texto={linha.gestor} />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-[8px] bg-surface-2 px-3 py-2.5 text-[13px] text-texto">
              Não achei linhas de vidas nesta planilha. Baixe e confira o cabeçalho — o modelo pede Nome e CPF.
            </p>
          )}

          {previa.cortada ? (
            <p className="text-[12.5px] text-muted">
              Mostrando as primeiras {previa.linhas.length} de {previa.total}. Baixe o arquivo para ver todas.
            </p>
          ) : null}

          <p className="text-[12.5px] leading-relaxed text-muted">
            Linha em âmbar tem campo em branco ou que não confere. Isso <b>não impede</b> conferir o mês — a
            analista decide, e quase sempre é informação que já veio por telefone.
          </p>
        </>
      ) : null}

      {podeDecidir ? <Decisoes /> : null}

      <Aviso estado={aviso.estado} onFechar={aviso.fechar} />
    </>
  );

  function Decisoes() {
    return (
      <>
        <div className="rounded-[10px] border border-line bg-surface p-4 sm:p-5">
          <Campo
            rotulo="Observação da conferência (opcional)"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="ex.: cargo da Mariana confirmado por telefone"
            dica="Fica no histórico do mês."
            maxLength={300}
          />
        </div>

        {erro ? (
          <p role="alert" className="text-[13px] text-bad">
            {erro}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <Botao
            variante="secundario"
            onClick={() => {
              setErro(null);
              setPedindo(true);
            }}
            disabled={salvando || passo !== "planilha_recebida"}
          >
            Pedir correção ao cliente
          </Botao>

          <span className="flex-1" />

          <span className="text-[12.5px] leading-relaxed text-muted">
            Conferir avança para o corte, e a mensagem sai no dia.
          </span>

          <Botao onClick={() => void decidir("conferir")} disabled={salvando || passo !== "planilha_recebida"}>
            {salvando ? "Salvando…" : "Conferida · avançar"}
          </Botao>
        </div>

        <Modal
          aberto={pedindo}
          titulo={`Pedir correção · ${cliente}`}
          descricao={`O mês volta para "informar" e o cliente reenvia a planilha. O texto abaixo vai para ele.`}
          onFechar={() => setPedindo(false)}
          acoes={
            <>
              <Botao variante="secundario" onClick={() => setPedindo(false)} disabled={salvando}>
                Cancelar
              </Botao>
              <Botao onClick={() => void decidir("pedir_correcao")} disabled={salvando || !motivo.trim()}>
                {salvando ? "Salvando…" : "Pedir correção"}
              </Botao>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            <Campo
              rotulo="O que precisa ser corrigido"
              required
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="ex.: faltou o CPF de 2 colaboradores"
              dica="Entra na mensagem como está escrito aqui."
              maxLength={300}
            />

            <p className="rounded-[8px] bg-surface-2 px-3 py-2.5 text-[12.5px] leading-relaxed text-texto">
              A planilha recusada sai do lugar e fica no acervo do cliente. O que vale é a próxima. A mensagem de
              correção você envia pelo Controle, no botão da linha.
            </p>

            {erro ? (
              <p role="alert" className="text-[12.5px] text-bad">
                {erro}
              </p>
            ) : null}
          </div>
        </Modal>
      </>
    );
  }
}

function Tile({ valor, rotulo, cor }: { valor: number; rotulo: string; cor?: string }) {
  return (
    <div className="flex min-w-[170px] flex-1 items-center gap-2.5 rounded-[10px] border border-line bg-surface px-4 py-2.5">
      <b className={`tabular text-[20px] leading-none font-[800] ${valor ? (cor ?? "text-heading") : "text-faint"}`}>
        {valor}
      </b>
      <span className="text-[12.5px] leading-tight text-muted">{rotulo}</span>
    </div>
  );
}

function Celula({
  texto,
  problema = false,
  forte = false,
  tabular = false,
}: {
  texto: string | null;
  problema?: boolean;
  forte?: boolean;
  tabular?: boolean;
}) {
  return (
    <td className="px-2.5 py-2">
      {texto ? (
        <span
          className={[
            tabular ? "tabular" : "",
            forte ? "font-[600] text-heading" : "text-texto",
            problema ? "font-[600] text-warn" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {texto}
        </span>
      ) : (
        <span className={problema ? "text-[11.5px] font-[600] text-warn" : "text-faint"}>
          {problema ? "em branco" : "—"}
        </span>
      )}
    </td>
  );
}

/** `2026-08-27` → `27/08/1976` fica longo na coluna; aqui vai `27/08/76`. */
function dia(iso: string | null): string | null {
  if (!iso) return null;
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
}

function quando(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

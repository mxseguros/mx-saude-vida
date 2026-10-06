import type { Metadata } from "next";

import { TopoPagina } from "@/app/_admin/moldura";
import { listarControles, listarModelos } from "@/lib/controles/consulta";
import { CHAVES_DE_DATA, contarPrazos, ROTULO_DATA, rotuloDaCompetencia } from "@/lib/dominio/controle";
import { competenciaDeHoje, hojeSaoPaulo } from "@/lib/dominio/hoje";
import { ROTULO_CANAL } from "@/lib/dominio/mensagem";

import { montarAgenda, type MesParaAgenda } from "@/lib/dominio/atividade";
import { nomeCurto } from "@/lib/dominio/cliente";

import { AbrirMes } from "./abrir-mes";
import { Acoes } from "./acoes";
import { VistaMes, VistaSemana } from "./agenda";
import { Data, Etiqueta, Nome, UltimaMensagem } from "./linha";
import { SeletorDeVista, type Vista } from "./seletor-de-vista";

export const metadata: Metadata = { title: "Controle mensal" };

/**
 * O Controle mensal — a tela central do sistema.
 *
 * Uma linha por segurado, com as QUATRO datas do mês sempre à vista. A do
 * passo atual é a única colorida: é ela que conta. As cumpridas saem riscadas
 * e as futuras em cinza.
 *
 * A tabela NÃO rola de lado: largura fixa por coluna e o texto quebra na
 * célula. Rolagem horizontal esconde justamente a coluna da ação.
 */
export default async function PaginaControle({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; vista?: string; dia?: string }>;
}) {
  const { mes, vista, dia } = await searchParams;
  const competencia = /^\d{4}-\d{2}$/.test(mes ?? "") ? (mes as string) : competenciaDeHoje();
  const hoje = hojeSaoPaulo();

  // Vista e dia vêm da URL, então vêm de fora: valor estranho cai na Lista e
  // num dia nulo, em vez de quebrar a tela.
  const atual: Vista = vista === "mes" || vista === "semana" ? vista : "lista";
  const diaEscolhido = /^\d{4}-\d{2}-\d{2}$/.test(dia ?? "") ? (dia as string) : null;

  const [controle, modelos] = await Promise.all([listarControles(competencia), listarModelos()]);
  const contagem = contarPrazos(controle.dados, hoje);

  // A agenda é derivada das MESMAS linhas da Lista — nenhuma consulta a mais, e
  // nenhum lugar onde os dois possam discordar sobre o estado de um mês.
  const agenda = montarAgenda(
    controle.dados.map(
      (linha): MesParaAgenda => ({
        id: linha.id,
        cliente: nomeCurto({ razaoSocial: linha.razaoSocial, nomeFantasia: linha.nomeFantasia }),
        seguradora: linha.seguradora,
        analista: linha.analista,
        passo: linha.passo,
        datas: linha.datas,
        acompanhaPagamento: linha.acompanhaPagamento,
        emissaoConfirmada: linha.emissaoConfirmadaEm !== null,
      }),
    ),
    hoje,
  );

  const tiles = [
    { valor: contagem.vencidos, rotulo: contagem.vencidos === 1 ? "segurado com prazo vencido" : "segurados com prazo vencido", cor: "text-bad" },
    { valor: contagem.hoje, rotulo: contagem.hoje === 1 ? "prazo vence hoje" : "prazos vencem hoje", cor: "text-bad" },
    { valor: contagem.perto, rotulo: contagem.perto === 1 ? "prazo vence em até 3 dias" : "prazos vencem em até 3 dias", cor: "text-warn" },
    { valor: contagem.paraConferir, rotulo: contagem.paraConferir === 1 ? "planilha aguardando conferência" : "planilhas aguardando conferência", cor: "text-brand" },
  ];

  return (
    <>
      <TopoPagina
        titulo={`Controle de ${rotuloDaCompetencia(competencia).toLowerCase()}`}
        contagem={controle.dados.length ? `${controle.dados.length} segurados` : undefined}
        acoes={
          <span className="flex flex-wrap items-center gap-2.5">
            <SeletorDeVista competencia={competencia} atual={atual} />
            <AbrirMes competencia={competencia} />
          </span>
        }
      />

      <div className="flex flex-col gap-4 p-4 sm:p-6">
        {controle.erro ? (
          <p role="alert" className="rounded-[8px] border border-warn bg-warn-soft p-3 text-[13.5px] text-texto">
            {controle.erro} A lista aparece quando a conexão voltar.
          </p>
        ) : null}

        {controle.dados.length ? (
          <>
            {/* Os quatro números, e a legenda pelo EXEMPLO da cor: a legenda
                mostra exatamente o que aparece na tabela, em vez de descrever. */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2.5">
                {tiles.map((t) => (
                  <div
                    key={t.rotulo}
                    className="flex min-w-[170px] flex-1 items-center gap-2.5 rounded-[10px] border border-line bg-surface px-4 py-2.5"
                  >
                    <b className={`tabular text-[20px] leading-none font-[800] ${t.valor ? t.cor : "text-faint"}`}>
                      {t.valor}
                    </b>
                    <span className="text-[12.5px] leading-tight text-muted">{t.rotulo}</span>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-[8px] border border-line px-3 py-2 text-[12px] text-muted">
                <span className="font-(family-name:--font-display) text-[11px] font-[700] uppercase tracking-[.06em] text-faint">
                  Legenda Datas
                </span>
                <span>
                  <b className="tabular mr-1 font-[700] text-bad">10/09</b> vencida ou hoje
                </span>
                <span>
                  <b className="tabular mr-1 font-[700] text-warn">25/09</b> vence em até 3 dias
                </span>
                <span>
                  <b className="tabular mr-1 font-[700] text-brand">30/09</b> etapa atual, no prazo
                </span>
                <span>
                  <b className="tabular mr-1 text-faint line-through">08/09</b> já cumprida
                </span>
              </div>
            </div>

            {/* Mês e Semana: os mesmos dados virados de lado — uma atividade
                por data, em vez de uma linha por cliente com quatro datas. */}
            {atual === "mes" ? (
              <VistaMes competencia={competencia} atividades={agenda} hoje={hoje} diaEscolhido={diaEscolhido} />
            ) : atual === "semana" ? (
              <VistaSemana competencia={competencia} atividades={agenda} hoje={hoje} diaEscolhido={diaEscolhido} />
            ) : null}

            {atual === "lista" ? (
              <>
            {/* Desktop: tabela de largura fixa, sem rolagem lateral. */}
            <div className="hidden overflow-hidden rounded-[10px] border border-line bg-surface lg:block">
              <table className="w-full table-fixed border-collapse text-[12.5px]">
                <colgroup>
                  <col className="w-[19%]" />
                  <col className="w-[10%]" />
                  <col className="w-[12%]" />
                  <col className="w-[7%]" />
                  <col className="w-[7%]" />
                  <col className="w-[7%]" />
                  <col className="w-[7%]" />
                  <col className="w-[14%]" />
                  <col className="w-[17%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-line bg-surface-2 text-left">
                    {["Segurado", "Cia", "Etapa"].map((t) => (
                      <th
                        key={t}
                        className="px-2.5 py-2 font-(family-name:--font-display) text-[10.5px] font-[700] uppercase tracking-[.06em] text-muted"
                      >
                        {t}
                      </th>
                    ))}
                    {CHAVES_DE_DATA.map((chave) => (
                      <th
                        key={chave}
                        className="px-2.5 py-2 text-right font-(family-name:--font-display) text-[10.5px] font-[700] uppercase tracking-[.06em] text-muted"
                      >
                        {chave === "vencimento" ? "Venc." : ROTULO_DATA[chave].replace(" até", "")}
                      </th>
                    ))}
                    <th className="px-2.5 py-2 font-(family-name:--font-display) text-[10.5px] font-[700] uppercase tracking-[.06em] text-muted">
                      Última mensagem
                    </th>
                    <th className="px-2.5 py-2 font-(family-name:--font-display) text-[10.5px] font-[700] uppercase tracking-[.06em] text-muted">
                      Próximo passo
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {controle.dados.map((linha) => (
                    <tr key={linha.id} className="border-b border-line align-middle last:border-0 hover:bg-surface-2">
                      <td className="px-2.5 py-2.5">
                        <Nome linha={linha} />
                      </td>
                      <td className="px-2.5 py-2.5 text-muted">{linha.seguradora ?? "—"}</td>
                      <td className="px-2.5 py-2.5">
                        <Etiqueta passo={linha.passo} />
                      </td>
                      {CHAVES_DE_DATA.map((chave) => (
                        <td key={chave} className="px-2.5 py-2.5 text-right">
                          <Data chave={chave} linha={linha} hoje={hoje} />
                        </td>
                      ))}
                      <td className="px-2.5 py-2.5">
                        <UltimaMensagem linha={linha} />
                      </td>
                      <td className="px-2.5 py-2.5">
                        <Acoes linha={linha} modelos={modelos.dados} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Celular: cartão, com as mesmas quatro datas em linha. */}
            <ul className="flex list-none flex-col gap-2 lg:hidden">
              {controle.dados.map((linha) => (
                <li key={linha.id} className="flex flex-col gap-2 rounded-[10px] border border-line bg-surface p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Nome linha={linha} />
                    <Etiqueta passo={linha.passo} />
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
                    {CHAVES_DE_DATA.map((chave) => (
                      <span key={chave} className="flex items-center gap-1.5">
                        <span className="text-faint">{chave === "vencimento" ? "Venc." : ROTULO_DATA[chave].replace(" até", "")}</span>
                        <Data chave={chave} linha={linha} hoje={hoje} />
                      </span>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[12px] text-muted">
                      {linha.seguradora ?? "sem seguradora"} · {ROTULO_CANAL[linha.canal]}
                    </span>
                    <Acoes linha={linha} modelos={modelos.dados} />
                  </div>
                </li>
              ))}
            </ul>
              </>
            ) : null}

            {atual === "lista" ? (
              <p className="text-[12.5px] leading-relaxed text-muted">
                Todo mês o sistema abre uma linha por segurado e envia a primeira mensagem no dia configurado no
                cadastro. Passe o mouse numa data para saber o que a cor quer dizer.
              </p>
            ) : null}
          </>
        ) : null}

        {!controle.erro && controle.dados.length === 0 ? (
          <div className="rounded-[10px] border border-line bg-surface p-6 text-center">
            <p className="font-(family-name:--font-display) text-[15px] font-[700] text-heading">
              {rotuloDaCompetencia(competencia)} ainda não foi aberto
            </p>
            <p className="mx-auto mt-1.5 max-w-[52ch] text-[13.5px] leading-relaxed text-muted">
              Abrir o mês cria uma linha por cliente ativo, com as quatro datas já calculadas a partir das regras
              de cada cadastro. Normalmente isso acontece sozinho, toda manhã.
            </p>
            <div className="mt-4">
              <AbrirMes competencia={competencia} />
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

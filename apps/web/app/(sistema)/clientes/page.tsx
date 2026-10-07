import type { Metadata } from "next";

import { TopoPagina } from "@/app/_admin/moldura";
import { LinkBotao } from "@/componentes/ui/botao";
import { MarcarEmLote } from "./marcar-em-lote";
import { contarClientes, listarClientes } from "@/lib/clientes/consulta";
import { nomeCurto, ROTULO_PRODUTO } from "@/lib/dominio/cliente";
import { formatarDocumento } from "@/lib/dominio/documento";
import { ROTULO_CANAL } from "@/lib/dominio/mensagem";

import { Filtros } from "./filtros";

export const metadata: Metadata = { title: "Clientes" };

/**
 * A carteira: uma linha por segurado, com as colunas que a equipe já conhece
 * do controle de faturas — segurado, CNPJ, cia, tipo, corte, vencimento.
 *
 * A busca e o filtro vivem na URL: a analista manda o link do que está vendo,
 * e o botão voltar do navegador funciona.
 */
export default async function PaginaClientes({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; situacao?: string }>;
}) {
  const { q, situacao } = await searchParams;
  const aba = situacao === "inativos" || situacao === "todos" ? situacao : "ativos";

  const [lista, contagem] = await Promise.all([
    listarClientes({ termo: q, situacao: aba }),
    contarClientes(),
  ]);

  return (
    <>
      <TopoPagina
        titulo="Clientes"
        contagem={lista.dados.length ? `${lista.dados.length} na lista` : undefined}
        acoes={
          <span className="flex flex-wrap items-center gap-2.5">
            <MarcarEmLote />
            <LinkBotao href="/clientes/novo">+ Novo cliente</LinkBotao>
          </span>
        }
      />

      <div className="flex flex-col gap-4 p-4 sm:p-6">
        <Filtros termo={q ?? ""} situacao={aba} contagem={contagem.dados} />

        {lista.erro ? (
          <p role="alert" className="rounded-[8px] border border-warn bg-warn-soft p-3 text-[13.5px] text-texto">
            {lista.erro} A lista aparece quando a conexão voltar.
          </p>
        ) : null}

        {!lista.erro && lista.dados.length === 0 ? (
          // Beco sem saída é defeito: a tela diz o que fazer, e não só que
          // está vazia.
          <div className="rounded-[10px] border border-line bg-surface p-6 text-center">
            <p className="font-(family-name:--font-display) text-[15px] font-[700] text-heading">
              {q ? "Nenhum cliente com esse termo" : "Nenhum cliente cadastrado ainda"}
            </p>
            <p className="mx-auto mt-1.5 max-w-[46ch] text-[13.5px] leading-relaxed text-muted">
              {q
                ? "Procure por parte da razão social, do nome fantasia ou pelos primeiros dígitos do CNPJ."
                : "O cadastro do cliente guarda a apólice, as quatro datas do mês e por onde avisar o gestor. É dele que o Controle nasce."}
            </p>
            {!q ? (
              <div className="mt-4">
                <LinkBotao href="/clientes/novo">Cadastrar o primeiro cliente</LinkBotao>
              </div>
            ) : null}
          </div>
        ) : null}

        {lista.dados.length ? (
          <>
            {/* Tabela no desktop, cartões no celular: a mesma informação, sem
                rolagem lateral em nenhum dos dois. */}
            <div className="hidden overflow-hidden rounded-[10px] border border-line bg-surface md:block">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-line bg-surface-2 text-left">
                    <th className="px-3 py-2.5 font-(family-name:--font-display) text-[11px] font-[700] uppercase tracking-[.06em] text-muted">
                      Segurado
                    </th>
                    <th className="px-3 py-2.5 font-(family-name:--font-display) text-[11px] font-[700] uppercase tracking-[.06em] text-muted">
                      CNPJ
                    </th>
                    <th className="px-3 py-2.5 font-(family-name:--font-display) text-[11px] font-[700] uppercase tracking-[.06em] text-muted">
                      Cia
                    </th>
                    <th className="px-3 py-2.5 font-(family-name:--font-display) text-[11px] font-[700] uppercase tracking-[.06em] text-muted">
                      Tipo
                    </th>
                    <th className="px-3 py-2.5 text-right font-(family-name:--font-display) text-[11px] font-[700] uppercase tracking-[.06em] text-muted">
                      Corte
                    </th>
                    <th className="px-3 py-2.5 text-right font-(family-name:--font-display) text-[11px] font-[700] uppercase tracking-[.06em] text-muted">
                      Venc.
                    </th>
                    <th className="px-3 py-2.5 font-(family-name:--font-display) text-[11px] font-[700] uppercase tracking-[.06em] text-muted">
                      Canal
                    </th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {lista.dados.map((cliente) => (
                    <tr key={cliente.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                      <td className="px-3 py-2.5">
                        <a
                          href={`/clientes/${cliente.id}`}
                          className="font-[600] text-heading underline-offset-2 hover:underline"
                        >
                          {nomeCurto(cliente)}
                        </a>
                        {!cliente.ativo ? (
                          <span className="ml-2 rounded-full bg-surface-3 px-2 py-0.5 text-[11px] text-muted">
                            inativo
                          </span>
                        ) : null}
                        {cliente.movimentacaoPropria ? (
                          <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-on-accent-soft">
                            movimentação própria
                          </span>
                        ) : null}
                      </td>
                      <td className="tabular px-3 py-2.5 text-muted">{formatarDocumento(cliente.documento)}</td>
                      <td className="px-3 py-2.5">{cliente.seguradora ?? "—"}</td>
                      <td className="px-3 py-2.5">{ROTULO_PRODUTO[cliente.produto]}</td>
                      <td className="tabular px-3 py-2.5 text-right">{cliente.corteDia ?? "—"}</td>
                      <td className="tabular px-3 py-2.5 text-right">{cliente.vencimentoDia}</td>
                      <td className="px-3 py-2.5 text-muted">{ROTULO_CANAL[cliente.canal]}</td>
                      <td className="px-3 py-2.5 text-right">
                        <a
                          href={`/clientes/${cliente.id}`}
                          className="font-(family-name:--font-display) text-[12.5px] font-[600] text-brand"
                        >
                          Abrir
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="flex list-none flex-col gap-2 md:hidden">
              {lista.dados.map((cliente) => (
                <li key={cliente.id}>
                  <a
                    href={`/clientes/${cliente.id}`}
                    className="flex flex-col gap-1 rounded-[10px] border border-line bg-surface p-3.5"
                  >
                    <span className="font-(family-name:--font-display) text-[15px] font-[700] text-heading">
                      {nomeCurto(cliente)}
                    </span>
                    <span className="tabular text-[12.5px] text-muted">
                      {formatarDocumento(cliente.documento)}
                    </span>
                    <span className="text-[12.5px] text-texto">
                      {cliente.seguradora ?? "sem seguradora"} · {ROTULO_PRODUTO[cliente.produto]} · vence dia{" "}
                      {cliente.vencimentoDia}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </>
  );
}

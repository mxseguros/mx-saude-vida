import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TopoPagina } from "@/app/_admin/moldura";
import { lerApoliceAtiva } from "@/lib/clientes/apolice";
import {
  lerCliente,
  listarAcervo,
  listarBoletos,
  listarMovimentacoes,
  listarSeguradoras,
} from "@/lib/clientes/consulta";
import { apoliceParaFormulario, esquemaCapital } from "@/lib/dominio/apolice";
import { nomeCurto } from "@/lib/dominio/cliente";
import { ativo, resumir } from "@/lib/dominio/funcionario";
import { competenciaDeHoje } from "@/lib/dominio/hoje";
import { listarFuncionarios } from "@/lib/funcionarios/servico";
import { situacaoDaLeitura } from "@/lib/ia/registro";
import { perfilAtual } from "@/lib/supabase/servidor";

import { FormularioCliente } from "../formulario";
import { Abas, abaDe } from "./abas";
import { Documentos } from "./acervo";
import { BlocoDaApolice } from "./apolice";
import { Boletos } from "./boletos";
import { Funcionarios } from "./funcionarios/funcionarios";
import { Movimentacoes } from "./movimentacoes";

export const metadata: Metadata = { title: "Cliente" };

/**
 * A ficha do cliente em abas (v0.7): Cadastro e apólice · Funcionários ·
 * Movimentações · Boletos. A aba vem da URL, e cada uma carrega só o que usa.
 */
export default async function PaginaCliente({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const { id } = await params;
  const aba = abaDe((await searchParams).aba);

  // Funcionários e apólice entram em todas: a contagem vai na aba, e o
  // capital e o prêmio servem a Funcionários e Movimentações.
  const [cliente, funcionarios, apolice] = await Promise.all([lerCliente(id), listarFuncionarios(id), lerApoliceAtiva(id)]);

  if (cliente.erro) {
    return (
      <>
        <TopoPagina titulo="Cliente" voltar={{ href: "/clientes", rotulo: "Voltar para Clientes" }} />
        <div className="p-4 sm:p-6">
          <p role="alert" className="rounded-[8px] border border-warn bg-warn-soft p-3 text-[13.5px] text-texto">
            {cliente.erro} Tente de novo em alguns instantes.
          </p>
        </div>
      </>
    );
  }
  if (!cliente.dados) notFound();

  const capital = esquemaCapital.safeParse(apolice?.capital);
  const regra = { capital: capital.success ? capital.data : null, taxaPorMil: apolice?.taxaPorMil ?? null };
  const resumo = resumir(funcionarios.dados, apolice ? regra : null);

  let conteudo: React.ReactNode = null;

  if (aba === "cadastro") {
    const [seguradoras, eu] = await Promise.all([listarSeguradoras(), perfilAtual()]);
    const situacao = eu ? await situacaoDaLeitura(eu.id) : { disponivel: false, motivo: "sem_chave" as const };
    conteudo = (
      <div className="flex flex-col gap-4">
        <FormularioCliente cliente={cliente.dados} seguradoras={seguradoras.dados} />
        <BlocoDaApolice
          clienteId={id}
          inicial={apolice ? apoliceParaFormulario(apolice) : null}
          pdfNome={apolice?.pdfNome ?? null}
          situacao={situacao}
        />
      </div>
    );
  }

  if (aba === "funcionarios") {
    conteudo = funcionarios.erro ? (
      <Erro mensagem={funcionarios.erro} />
    ) : (
      <Funcionarios
        clienteId={id}
        lista={funcionarios.dados}
        resumo={resumo}
        capital={regra.capital}
        temApolice={Boolean(apolice)}
      />
    );
  }

  if (aba === "movimentacoes") {
    const [meses, documentos] = await Promise.all([listarMovimentacoes(id), listarAcervo(id)]);
    conteudo = meses.erro ? (
      <Erro mensagem={meses.erro} />
    ) : (
      <div className="flex flex-col gap-4">
        <Movimentacoes
          lista={meses.dados}
          atual={{ competencia: competenciaDeHoje(), vidas: resumo.ativos, premio: resumo.premioPrevisto }}
        />
        {documentos.dados.length ? <Documentos lista={documentos.dados} /> : null}
      </div>
    );
  }

  if (aba === "boletos") {
    const boletos = await listarBoletos(id);
    conteudo = boletos.erro ? <Erro mensagem={boletos.erro} /> : <Boletos lista={boletos.dados} />;
  }

  return (
    <>
      <TopoPagina titulo={nomeCurto(cliente.dados)} voltar={{ href: "/clientes", rotulo: "Voltar para Clientes" }} />
      <div className="p-4 sm:p-6">
        <div className={`mx-auto flex flex-col gap-4 ${aba === "cadastro" ? "max-w-[840px]" : "max-w-[1100px]"}`}>
          <Abas clienteId={id} atual={aba} funcionarios={funcionarios.dados.filter(ativo).length} />
          {conteudo}
        </div>
      </div>
    </>
  );
}

function Erro({ mensagem }: { mensagem: string }) {
  return (
    <p role="alert" className="rounded-[8px] border border-warn bg-warn-soft p-3 text-[13.5px] text-texto">
      {mensagem} Tente de novo em alguns instantes.
    </p>
  );
}

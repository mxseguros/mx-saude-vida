import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TopoPagina } from "@/app/_admin/moldura";
import { lerApoliceAtiva } from "@/lib/clientes/apolice";
import { lerCliente } from "@/lib/clientes/consulta";
import { esquemaCapital } from "@/lib/dominio/apolice";
import { nomeCurto } from "@/lib/dominio/cliente";
import { resumir } from "@/lib/dominio/funcionario";
import { listarFuncionarios } from "@/lib/funcionarios/servico";

import { Funcionarios } from "./funcionarios";

export const metadata: Metadata = { title: "Funcionários" };

export default async function PaginaFuncionarios({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [cliente, lista, apolice] = await Promise.all([lerCliente(id), listarFuncionarios(id), lerApoliceAtiva(id)]);

  if (cliente.erro || lista.erro) {
    return (
      <>
        <TopoPagina titulo="Funcionários" voltar={{ href: `/clientes/${id}`, rotulo: "Voltar para o cliente" }} />
        <div className="p-4 sm:p-6">
          <p role="alert" className="rounded-[8px] border border-warn bg-warn-soft p-3 text-[13.5px] text-texto">
            {cliente.erro ?? lista.erro} Tente de novo em alguns instantes.
          </p>
        </div>
      </>
    );
  }
  if (!cliente.dados) notFound();

  const capital = esquemaCapital.safeParse(apolice?.capital);
  const regra = { capital: capital.success ? capital.data : null, taxaPorMil: apolice?.taxaPorMil ?? null };

  return (
    <>
      <TopoPagina
        titulo={`Funcionários · ${nomeCurto(cliente.dados)}`}
        voltar={{ href: `/clientes/${id}`, rotulo: "Voltar para o cliente" }}
      />
      <div className="p-4 sm:p-6">
        <Funcionarios
          clienteId={id}
          lista={lista.dados}
          resumo={resumir(lista.dados, apolice ? regra : null)}
          capital={regra.capital}
          temApolice={Boolean(apolice)}
        />
      </div>
    </>
  );
}

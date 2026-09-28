import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TopoPagina } from "@/app/_admin/moldura";
import { lerCliente, listarSeguradoras } from "@/lib/clientes/consulta";
import { nomeCurto } from "@/lib/dominio/cliente";

import { FormularioCliente } from "../formulario";

export const metadata: Metadata = { title: "Cliente" };

export default async function PaginaCliente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [cliente, seguradoras] = await Promise.all([lerCliente(id), listarSeguradoras()]);

  // Erro de banco e cliente inexistente merecem telas diferentes: mandar os
  // dois para o 404 esconde instabilidade atras de "nao encontrado".
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

  return (
    <>
      <TopoPagina
        titulo={nomeCurto(cliente.dados)}
        voltar={{ href: "/clientes", rotulo: "Voltar para Clientes" }}
      />

      <div className="p-4 sm:p-6">
        <div className="mx-auto max-w-[840px]">
          <FormularioCliente cliente={cliente.dados} seguradoras={seguradoras.dados} />
        </div>
      </div>
    </>
  );
}

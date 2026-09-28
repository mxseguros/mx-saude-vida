import type { Metadata } from "next";

import { TopoPagina } from "@/app/_admin/moldura";
import { listarSeguradoras } from "@/lib/clientes/consulta";

import { FormularioCliente } from "../formulario";

export const metadata: Metadata = { title: "Novo cliente" };

export default async function PaginaNovoCliente() {
  const seguradoras = await listarSeguradoras();

  return (
    <>
      <TopoPagina titulo="Novo cliente" voltar={{ href: "/clientes", rotulo: "Voltar para Clientes" }} />

      <div className="p-4 sm:p-6">
        <div className="mx-auto max-w-[840px]">
          {seguradoras.erro ? (
            <p role="alert" className="mb-4 rounded-[8px] border border-warn bg-warn-soft p-3 text-[13.5px] text-texto">
              {seguradoras.erro} Você pode cadastrar o cliente e escolher a seguradora depois.
            </p>
          ) : null}

          <FormularioCliente seguradoras={seguradoras.dados} />
        </div>
      </div>
    </>
  );
}

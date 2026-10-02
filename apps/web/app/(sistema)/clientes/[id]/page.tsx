import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TopoPagina } from "@/app/_admin/moldura";
import { lerCliente, listarAcervo, listarBoletos, listarSeguradoras } from "@/lib/clientes/consulta";
import { listarAcessos } from "@/lib/clientes/acesso";
import { nomeCurto } from "@/lib/dominio/cliente";

import { FormularioCliente } from "../formulario";
import { AcessoAoPortal } from "./acesso-ao-portal";
import { Acervo } from "./acervo";

export const metadata: Metadata = { title: "Cliente" };

export default async function PaginaCliente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [cliente, seguradoras, acessos, boletos, documentos] = await Promise.all([
    lerCliente(id),
    listarSeguradoras(),
    listarAcessos(id),
    listarBoletos(id),
    listarAcervo(id),
  ]);

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
        <div className="mx-auto flex max-w-[840px] flex-col gap-4">
          <FormularioCliente cliente={cliente.dados} seguradoras={seguradoras.dados} />

          {/* Depois do formulário de propósito: o acesso ao portal é consequência
              do cadastro, e quem abre esta tela quase sempre vem conferir ou
              corrigir um campo, não dar acesso. */}
          <AcessoAoPortal
            clienteId={id}
            acessos={acessos.dados}
            nomeDoCliente={nomeCurto(cliente.dados)}
            nomeDoGestor={cliente.dados.gestorNome}
            emailDoGestor={cliente.dados.gestorEmail}
            celularDoGestor={cliente.dados.gestorCelular}
          />

          {/* Por último: é consulta, não cadastro. Quem abre esta tela vem
              corrigir um campo; o acervo é para quando o cliente ligou. */}
          <Acervo boletos={boletos.dados} documentos={documentos.dados} />
        </div>
      </div>
    </>
  );
}

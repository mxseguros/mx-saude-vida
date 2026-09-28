import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { TopoPagina } from "@/app/_admin/moldura";
import { perfilAtual } from "@/lib/supabase/servidor";
import { lerEquipe, lerModelos } from "@/lib/configuracao/consulta";

import { PainelConfiguracoes } from "./painel";

export const metadata: Metadata = { title: "Configurações" };

/**
 * Configurações.
 *
 * Duas abas, e é de propósito: quem tem acesso, e o que o sistema escreve aos
 * clientes. É o que faz a MX mudar a própria operação sem esperar um deploy —
 * e o texto das mensagens é justamente o que mais muda.
 *
 * Só o administrador entra. A RLS já barra a escrita e as rotas barram de
 * novo; esta guarda evita a terceira situação: a tela abrir cheia de botões
 * que vão todos falhar.
 */
export default async function PaginaConfiguracoes() {
  const perfil = await perfilAtual();
  if (!perfil) redirect("/entrar?destino=/configuracoes");
  if (perfil.papel !== "admin") redirect("/controle");

  const [equipe, modelos] = await Promise.all([lerEquipe(), lerModelos()]);

  return (
    <>
      <TopoPagina titulo="Configurações" />

      {equipe.erro ?? modelos.erro ? (
        <div
          role="alert"
          className="m-4 rounded-[8px] border border-warn bg-warn-soft p-3 text-[13.5px] text-texto sm:m-6"
        >
          {equipe.erro ?? modelos.erro}
        </div>
      ) : null}

      <PainelConfiguracoes equipe={equipe.dados} modelos={modelos.dados} euMesmo={perfil.id} />
    </>
  );
}

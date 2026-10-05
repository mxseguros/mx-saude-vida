import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TopoPagina } from "@/app/_admin/moldura";
import { lerControle } from "@/lib/controles/consulta";
import { lerTokenDoMes } from "@/lib/controles/coleta";
import { urlBase } from "@/lib/ambiente";
import { nomeCurto } from "@/lib/dominio/cliente";
import { valeAte } from "@/lib/dominio/coleta";
import { hojeSaoPaulo } from "@/lib/dominio/hoje";
import { rotuloDaCompetencia } from "@/lib/dominio/controle";
import { formatarData } from "@/lib/dominio/email";

import { Coleta } from "./coleta";

export const metadata: Metadata = { title: "Coleta da movimentação" };

/**
 * Como a movimentação deste mês vai chegar.
 *
 * Duas respostas na mesma tela, na ordem em que a MX as usa (decisão do
 * Gabriel, 05/10: o WhatsApp é prioridade):
 *
 *   1. **Mandar o link** para o gestor preencher — o caminho normal;
 *   2. **Preencher agora**, quando ele mandou por e-mail, áudio ou telefone.
 *
 * O segundo existe porque acontece. Sem ele a analista abriria o link do
 * cliente e se passaria por ele, e a MX perderia a única coisa que a
 * conferência precisa saber: quem disse o quê.
 */
export default async function PaginaDaColeta({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [controle, token] = await Promise.all([lerControle(id), lerTokenDoMes(id)]);

  if (controle.erro) {
    return (
      <>
        <TopoPagina titulo="Coleta da movimentação" voltar={{ href: "/controle", rotulo: "Voltar para o Controle" }} />
        <div className="p-4 sm:p-6">
          <p role="alert" className="rounded-[8px] border border-warn bg-warn-soft p-3 text-[13.5px] text-texto">
            {controle.erro} Tente de novo em alguns instantes.
          </p>
        </div>
      </>
    );
  }

  if (!controle.dados) notFound();

  const linha = controle.dados;
  const cliente = nomeCurto({ razaoSocial: linha.razaoSocial, nomeFantasia: linha.nomeFantasia });
  const hoje = hojeSaoPaulo();

  return (
    <>
      <TopoPagina
        titulo={`Coleta de ${rotuloDaCompetencia(linha.competencia).toLowerCase()}`}
        contagem={cliente}
        voltar={{ href: "/controle", rotulo: "Voltar para o Controle" }}
      />

      <div className="flex flex-col gap-4 p-4 sm:p-6">
        <p className="text-[13px] text-muted">
          {linha.seguradora ?? "sem seguradora"}
          {linha.datas.informar ? ` · informar até ${formatarData(linha.datas.informar)}` : ""}
          {linha.datas.corte ? ` · corte ${formatarData(linha.datas.corte)}` : ""}
        </p>

        <Coleta
          linha={linha}
          cliente={cliente}
          /**
           * A URL do link que JÁ existe, montada no servidor.
           *
           * Vem daqui e não do navegador: quando o domínio mudar, há um lugar
           * só para corrigir, e a analista que recarrega a página continua com
           * o mesmo link na mão em vez de gerar um novo sem querer — e gerar
           * um novo mata o que o gestor já recebeu.
           */
          urlAtual={token ? `${urlBase()}/coleta/${token}` : null}
          /** Até quando um link gerado HOJE valeria. A tela diz antes do clique. */
          valeAteSeGerarAgora={valeAte(linha.datas, hoje)}
          hoje={hoje}
        />
      </div>
    </>
  );
}

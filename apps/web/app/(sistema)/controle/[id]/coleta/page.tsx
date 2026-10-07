import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TopoPagina } from "@/app/_admin/moldura";
import { lerControle } from "@/lib/controles/consulta";
import { lerTokenDoMes } from "@/lib/controles/coleta";
import { lerApoliceAtiva } from "@/lib/clientes/apolice";
import { perfilAtual } from "@/lib/supabase/servidor";
import { urlBase } from "@/lib/ambiente";
import { nomeCurto } from "@/lib/dominio/cliente";
import { valeAte } from "@/lib/dominio/coleta";
import { hojeSaoPaulo } from "@/lib/dominio/hoje";
import { rotuloDaCompetencia } from "@/lib/dominio/controle";
import { formatarData } from "@/lib/dominio/email";

import { Coleta } from "./coleta";

export const metadata: Metadata = { title: "Nova coleta de movimentação" };

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

  // Cliente que faz a própria movimentação não tem coleta: a tela diz o porquê
  // e aponta onde mudar, em vez de abrir um formulário que não deveria existir.
  if (linha.movimentacaoPropria) {
    return (
      <>
        <TopoPagina titulo="Nova coleta de movimentação" voltar={{ href: "/controle", rotulo: "Voltar para o Controle" }} />
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-3 p-4 sm:p-6">
          <p role="status" className="rounded-[10px] border border-line bg-surface p-4 text-[13.5px] leading-relaxed text-texto">
            <b className="font-[600]">Este cliente faz a própria movimentação</b> direto na seguradora. A MX não coleta
            planilha nem manda link: o mês segue para o boleto e a confirmação do pagamento.
          </p>
          <p className="m-0 text-[13px] text-muted">
            Se isso mudou, desmarque a opção em{" "}
            <a href={`/clientes/${linha.clienteId}`} className="font-[600] text-heading underline underline-offset-2">
              Regras do mês do cliente
            </a>
            .
          </p>
        </div>
      </>
    );
  }

  const [apolice, eu] = await Promise.all([lerApoliceAtiva(linha.clienteId), perfilAtual()]);
  const cliente = nomeCurto({ razaoSocial: linha.razaoSocial, nomeFantasia: linha.nomeFantasia });
  const hoje = hojeSaoPaulo();

  return (
    <>
      <TopoPagina
        titulo="Nova coleta de movimentação"
        contagem={cliente}
        voltar={{ href: "/controle", rotulo: "Voltar para o Controle" }}
      />

      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4 p-4 sm:p-6">
        <p className="text-[13px] text-muted">
          {`${cliente} · ${linha.seguradora ?? "sem seguradora"} · ${rotuloDaCompetencia(linha.competencia).toLowerCase()}`}
          {linha.datas.informar ? ` · informar até ${formatarData(linha.datas.informar)}` : ""}
          {linha.datas.corte ? ` · corte ${formatarData(linha.datas.corte)}` : ""}
        </p>

        <Coleta
          linha={linha}
          cliente={cliente}
          apolice={apolice ? `${linha.seguradora ?? "Apólice"} · ${apolice.numero}` : null}
          analista={eu?.nome ?? "—"}
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

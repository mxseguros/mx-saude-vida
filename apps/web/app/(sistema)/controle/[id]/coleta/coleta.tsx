"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Botao } from "@/componentes/ui/botao";
import { Campo } from "@/componentes/ui/campo";
import { useAviso } from "@/componentes/ui/aviso";
import type { LinhaDoControle } from "@/lib/controles/consulta";
import { estadoDoLink } from "@/lib/dominio/coleta";
import { nomeDoMes } from "@/lib/dominio/controle";
import { formatarData } from "@/lib/dominio/email";
import { linkWhatsapp } from "@/lib/dominio/mensagem";
import { mascararTelefone } from "@/lib/dominio/mascaras";
import { descreverQuando } from "@/lib/dominio/quando";

import { FormularioDaEquipe } from "./formulario";

/**
 * Nova coleta de movimentação, como o tLink do protótipo v0.7: o envio pelo
 * WhatsApp primeiro (decisão #6), só com Gestor e Celular, ambos obrigatórios;
 * depois "ou preencha agora", com as 5 etapas.
 */
export function Coleta({
  linha,
  cliente,
  apolice,
  analista,
  urlAtual,
  valeAteSeGerarAgora,
  hoje,
}: {
  linha: LinhaDoControle;
  cliente: string;
  apolice: string | null;
  analista: string;
  urlAtual: string | null;
  valeAteSeGerarAgora: string;
  hoje: string;
}) {
  const router = useRouter();
  const aviso = useAviso();

  const [nome, setNome] = useState(linha.coleta.gestorDoMes.nome ?? linha.gestorNome ?? "");
  const [celular, setCelular] = useState(
    mascararTelefone(linha.coleta.gestorDoMes.celular ?? linha.gestorCelular ?? ""),
  );
  const [erros, setErros] = useState<{ nome?: string; celular?: string; geral?: string }>({});
  const [gerando, setGerando] = useState(false);
  const [registrada, setRegistrada] = useState<string | null>(null);

  const valeAte = linha.coleta.valeAte ?? valeAteSeGerarAgora;
  const estado = estadoDoLink({ token: urlAtual, valeAte: linha.coleta.valeAte, recebidoEm: linha.recebidaEm }, hoje);

  function conferirContato(): boolean {
    const novos: typeof erros = {};
    if (nome.trim().length < 3) novos.nome = "Informe o gestor responsável.";
    if (!linkWhatsapp(celular, "")) novos.celular = "Informe o celular com DDD.";
    setErros(novos);
    return !novos.nome && !novos.celular;
  }

  /**
   * Usa o link que já existe; só gera quando não há. A janela do WhatsApp abre
   * logo depois da resposta — gerar antes é o preço de a mensagem já levar o
   * endereço certo.
   */
  async function abrirWhatsapp() {
    if (!conferirContato()) return;
    setGerando(true);
    try {
      let url = urlAtual;
      if (!url) {
        const resposta = await fetch(`/api/v1/controles/${linha.id}/coleta`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome, celular, setor: "" }),
        });
        const json = await resposta.json().catch(() => null);
        if (!resposta.ok) {
          setErros({ geral: json?.error?.message ?? "Não foi possível gerar o link." });
          return;
        }
        url = json?.data?.url as string;
      }

      const destino = linkWhatsapp(celular, textoDoConvite(cliente, linha, url));
      if (destino) {
        const janela = window.open(destino, "_blank");
        if (janela) janela.opener = null;
      }
      aviso.mostrar(`WhatsApp aberto com o link para ${nome}.`);
      router.refresh();
    } catch {
      setErros({ geral: "Não foi possível falar com o servidor." });
    } finally {
      setGerando(false);
    }
  }

  async function copiar() {
    if (!urlAtual) return;
    try {
      await navigator.clipboard.writeText(urlAtual);
      aviso.mostrar("Link copiado.");
    } catch {
      aviso.mostrar("Não consegui copiar o link.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {linha.coleta.reenviouDepoisDeConferir ? (
        <p role="alert" className="rounded-[8px] border border-bad bg-bad-soft p-3 text-[13.5px] text-texto">
          <strong className="font-[600]">O gestor reenviou depois de você conferir.</strong> Confira de novo antes de o
          boleto sair.
        </p>
      ) : null}

      <section className="flex flex-col gap-4 rounded-[10px] border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 font-(family-name:--font-display) text-[16px] font-[600] text-heading">
            Enviar formulário por WhatsApp
          </h2>
          <p className="m-0 max-w-[62ch] text-[13px] leading-[1.6] text-muted">
            Quem sabe quem entrou e quem saiu é o gestor do cliente. Informe o gestor responsável e o celular: ele
            preenche o resto pelo link, no próprio celular. O link vale até {formatarData(valeAte)}.
          </p>
        </div>

        <div className="grid items-start gap-3 sm:grid-cols-2">
          <Campo
            rotulo="Gestor responsável"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            erro={erros.nome}
            required
            autoComplete="off"
          />
          <Campo
            rotulo="Contato · Celular"
            value={celular}
            onChange={(e) => setCelular(mascararTelefone(e.target.value))}
            erro={erros.celular}
            required
            inputMode="tel"
            placeholder="(00) 90000-0000"
            autoComplete="off"
          />
        </div>

        {erros.geral ? (
          <p role="alert" className="text-[13px] text-bad">
            {erros.geral}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Botao variante="whatsapp" onClick={() => void abrirWhatsapp()} disabled={gerando}>
            {gerando ? "Gerando…" : "Abrir o WhatsApp com o link"}
          </Botao>
          {urlAtual ? (
            <>
              <span className="text-[12.5px] text-muted">
                {estado === "enviado"
                  ? `Enviado ${descreverQuando(linha.recebidaEm ?? "")}.`
                  : linha.coleta.abertoEm
                    ? `Aberto ${descreverQuando(linha.coleta.abertoEm)}, ainda sem resposta.`
                    : "Link gerado, ainda não aberto."}
              </span>
              <Botao variante="texto" onClick={() => void copiar()}>
                Copiar o link
              </Botao>
            </>
          ) : null}
        </div>
      </section>

      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        <span className="text-[12px] font-[600] uppercase tracking-[0.06em] text-muted">ou preencha agora</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <section className="flex flex-col gap-4 rounded-[10px] border border-line bg-surface p-4 sm:p-5">
        {registrada !== null ? (
          <div className="flex flex-col gap-3">
            <p className="m-0 rounded-[8px] border border-ok bg-ok-soft p-3 text-[13.5px] text-texto">
              <b className="font-[600]">
                Coleta {registrada} registrada.
              </b>{" "}
              {linha.recebidaEm ? "A movimentação entrou no Controle." : "Entrou no Controle aguardando o gestor."}
            </p>
            <div className="flex flex-wrap gap-2.5">
              <Botao variante="whatsapp" onClick={() => void abrirWhatsapp()} disabled={gerando}>
                Enviar o formulário de {registrada} ao gestor pelo WhatsApp
              </Botao>
              <Botao variante="secundario" onClick={() => setRegistrada(null)}>
                Voltar ao formulário
              </Botao>
            </div>
          </div>
        ) : (
          <>
            <p className="m-0 text-[13px] text-muted">
              Entradas, saídas e planilha entram se o gestor já tiver passado. A coleta espera no Controle até o gestor
              responder ou você conferir.
            </p>
            <FormularioDaEquipe
              linha={linha}
              cliente={cliente}
              apolice={apolice}
              analista={analista}
              valeAte={valeAte}
              temLink={Boolean(urlAtual)}
              nome={nome}
              celular={celular}
              onNome={setNome}
              onCelular={setCelular}
              onRegistrada={(protocolo) => setRegistrada(protocolo || "da movimentação")}
            />
          </>
        )}
      </section>
    </div>
  );
}

/** O convite do WhatsApp. Curto: o `wa.me` só leva texto, e o resto está na página. */
function textoDoConvite(cliente: string, linha: LinhaDoControle, url: string): string {
  const prazo = linha.datas.informar ? ` até ${formatarData(linha.datas.informar)}` : "";
  return [
    "Olá! Aqui é da MX Corretora de Seguros.",
    "",
    `Para fechar a fatura de ${nomeDoMes(linha.competencia)} do seguro da ${cliente}, precisamos saber quem entrou e quem saiu no mês.`,
    "",
    `É rápido, pelo celular${prazo}:`,
    url,
    "",
    "Se ninguém entrou nem saiu, dá para confirmar isso no mesmo link.",
  ].join("\n");
}

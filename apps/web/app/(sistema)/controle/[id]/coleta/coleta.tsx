"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Botao } from "@/componentes/ui/botao";
import { Campo } from "@/componentes/ui/campo";
import { useAviso } from "@/componentes/ui/aviso";
import type { LinhaDoControle } from "@/lib/controles/consulta";
import { diasParaFechar, estadoDoLink } from "@/lib/dominio/coleta";
import { nomeDoMes } from "@/lib/dominio/controle";
import { formatarData } from "@/lib/dominio/email";
import { linkWhatsapp } from "@/lib/dominio/mensagem";
import { mascararTelefone } from "@/lib/dominio/mascaras";
import { descreverQuando } from "@/lib/dominio/quando";

import { FormularioDaEquipe } from "./formulario";

/**
 * A tela da coleta: mandar o link, ou preencher agora.
 *
 * A ORDEM É A DECISÃO #6 do Gabriel — o envio pelo WhatsApp é prioridade. Ele
 * vem primeiro, com o botão principal; preencher à mão fica abaixo do divisor,
 * porque é a exceção. Inverter faria a analista digitar quarenta nomes quando
 * bastava um link.
 */
export function Coleta({
  linha,
  cliente,
  urlAtual,
  valeAteSeGerarAgora,
  hoje,
}: {
  linha: LinhaDoControle;
  cliente: string;
  urlAtual: string | null;
  valeAteSeGerarAgora: string;
  hoje: string;
}) {
  const router = useRouter();
  const aviso = useAviso();

  // Pré-preenchido com o contato do MÊS quando já houve um, e com o do cadastro
  // quando é a primeira vez. O do mês vence porque é quem respondeu.
  const [nome, setNome] = useState(linha.coleta.gestorDoMes.nome ?? linha.gestorNome ?? "");
  const [celular, setCelular] = useState(
    mascararTelefone(linha.coleta.gestorDoMes.celular ?? linha.gestorCelular ?? ""),
  );
  const [setor, setSetor] = useState(linha.coleta.gestorDoMes.setor ?? "");

  const [url, setUrl] = useState(urlAtual);
  const [valeAte, setValeAte] = useState(linha.coleta.valeAte);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [preenchendo, setPreenchendo] = useState(false);

  const estado = estadoDoLink(
    { token: url, valeAte, recebidoEm: linha.recebidaEm },
    hoje,
  );

  /**
   * Gera o link e abre o WhatsApp no MESMO clique.
   *
   * A janela do WhatsApp tem de nascer do clique, e não depois do `await`:
   * aberta depois da ida à rede, o bloqueador de pop-up a barra. Então o link é
   * gerado primeiro, e a janela abre com o resultado — o que custa um instante
   * de espera, e é o preço de não perder a janela.
   */
  async function gerarEAbrir(abrirWhatsapp: boolean) {
    if (nome.trim().length < 3) {
      setErro("Informe o nome de quem vai receber o link.");
      return;
    }
    if (abrirWhatsapp && !linkWhatsapp(celular, "")) {
      setErro("Informe o celular com DDD para abrir o WhatsApp.");
      return;
    }

    setGerando(true);
    setErro(null);
    try {
      const resposta = await fetch(`/api/v1/controles/${linha.id}/coleta`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, celular, setor }),
      });
      const json = await resposta.json().catch(() => null);

      if (!resposta.ok) {
        setErro(json?.error?.message ?? "Não foi possível gerar o link.");
        return;
      }

      const nova = json?.data?.url as string;
      setUrl(nova);
      setValeAte(json?.data?.valeAte ?? valeAteSeGerarAgora);

      if (abrirWhatsapp) {
        const destino = linkWhatsapp(celular, textoDoConvite(cliente, linha, nova));
        if (destino) {
          const janela = window.open(destino, "_blank");
          // Sem `noopener` na chamada: com ele `window.open` devolve null por
          // especificação, e o código abriria uma segunda janela. Zerar o
          // opener em seguida protege igual.
          if (janela) janela.opener = null;
        }
      }

      aviso.mostrar(
        abrirWhatsapp
          ? "Link gerado. Envie pela janela do WhatsApp que abriu."
          : "Link gerado. Copie e mande por onde preferir.",
      );
      router.refresh();
    } catch {
      setErro("Não foi possível falar com o servidor.");
    } finally {
      setGerando(false);
    }
  }

  async function copiar() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      aviso.mostrar("Link copiado.");
    } catch {
      // Área de transferência bloqueada (http, permissão negada). O campo
      // abaixo mostra a URL inteira, então dá para selecionar à mão.
      aviso.mostrar("Não consegui copiar. Selecione o endereço abaixo.");
    }
  }

  const dias = valeAte ? diasParaFechar(valeAte, hoje) : null;

  return (
    <div className="flex flex-col gap-6">
      {/* O alerta da decisão #3 vem ANTES de tudo: se o gestor corrigiu depois
          da conferência, é isso que a analista precisa ver ao abrir a tela. */}
      {linha.coleta.reenviouDepoisDeConferir ? (
        <p role="alert" className="rounded-[8px] border border-bad bg-bad-soft p-3 text-[13.5px] text-texto">
          <strong className="font-[600]">O gestor reenviou depois de você conferir.</strong> A movimentação abaixo é a
          nova. Confira de novo antes de o boleto sair.
        </p>
      ) : null}

      {/* ----------------------------------------------------------------
          1 · Enviar o formulário por WhatsApp
          ---------------------------------------------------------------- */}
      <section className="flex flex-col gap-4 rounded-[10px] border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 font-(family-name:--font-display) text-[16px] font-[600] text-heading">
            Enviar formulário por WhatsApp
          </h2>
          <p className="m-0 text-[13px] leading-[1.5] text-muted">
            O gestor preenche no celular, sem senha. O link vale até{" "}
            {formatarData(valeAte ?? valeAteSeGerarAgora)}
            {linha.datas.corte ? " — o corte do mês" : ""}.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo
            rotulo="Gestor responsável"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            autoComplete="off"
            required
          />
          <Campo
            rotulo="Celular"
            value={celular}
            onChange={(e) => setCelular(mascararTelefone(e.target.value))}
            inputMode="tel"
            autoComplete="off"
            dica={linha.gestorCelular ? undefined : "O cadastro deste cliente não tem celular."}
          />
          <Campo
            rotulo="Setor"
            value={setor}
            onChange={(e) => setSetor(e.target.value)}
            autoComplete="off"
            dica="Opcional."
            className="sm:col-span-2"
          />
        </div>

        {erro ? (
          <p role="alert" className="text-[13px] text-bad">
            {erro}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2.5">
          <Botao variante="whatsapp" onClick={() => void gerarEAbrir(true)} disabled={gerando}>
            {gerando ? "Gerando…" : url ? "Refazer o link e abrir o WhatsApp" : "Abrir o WhatsApp com o link"}
          </Botao>

          {url ? (
            <Botao variante="secundario" onClick={() => void copiar()}>
              Copiar o link
            </Botao>
          ) : (
            <Botao variante="secundario" onClick={() => void gerarEAbrir(false)} disabled={gerando}>
              Só gerar o link
            </Botao>
          )}
        </div>

        {url ? (
          <div className="flex flex-col gap-2">
            {/* Refazer MATA o link anterior, e a tela diz isso antes do clique:
                a analista que clica para "atualizar o nome" não pode descobrir
                depois que o gestor perdeu o acesso no meio do preenchimento. */}
            <p className="text-[12.5px] leading-[1.5] text-muted">
              Refazer o link faz o anterior parar de abrir — inclusive para quem já estiver preenchendo.
            </p>

            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-[600] uppercase tracking-[0.04em] text-muted">O link deste mês</span>
              <input
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                className="h-11 w-full rounded-[6px] border border-line bg-surface-2 px-3 font-mono text-[12.5px] text-texto sm:h-10"
              />
            </label>

            <p className="text-[12.5px] text-muted">
              {estado === "enviado"
                ? `Enviado ${descreverQuando(linha.recebidaEm ?? "")}.`
                : linha.coleta.abertoEm
                  ? `O gestor abriu ${descreverQuando(linha.coleta.abertoEm)} e ainda não enviou.`
                  : "O gestor ainda não abriu."}
              {dias !== null && estado !== "enviado"
                ? dias > 0
                  ? ` Fecha em ${dias} dia${dias === 1 ? "" : "s"}.`
                  : dias === 0
                    ? " Fecha hoje."
                    : " Já fechou."
                : ""}
            </p>
          </div>
        ) : null}
      </section>

      {/* ----------------------------------------------------------------
          Divisor · 2 · Preencher agora
          ---------------------------------------------------------------- */}
      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        <span className="text-[12px] uppercase tracking-[0.06em] text-muted">ou preencha agora</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      {preenchendo ? (
        <FormularioDaEquipe
          linha={linha}
          nome={nome}
          celular={celular}
          setor={setor}
          onFechar={() => setPreenchendo(false)}
        />
      ) : (
        <section className="flex flex-col gap-3 rounded-[10px] border border-line bg-surface p-4 sm:p-5">
          <div className="flex flex-col gap-1">
            <h2 className="m-0 font-(family-name:--font-display) text-[16px] font-[600] text-heading">
              Preencher a movimentação agora
            </h2>
            <p className="m-0 text-[13px] leading-[1.5] text-muted">
              Para quando o gestor mandou por e-mail, por áudio ou pelo telefone. O que você digitar fica marcado como
              vindo da MX — é o que separa depois o que ele informou do que você anotou.
            </p>
          </div>

          {linha.coleta.entradasDoGestor + linha.coleta.saidasDoGestor > 0 ? (
            <p className="text-[13px] text-muted">
              O gestor já informou {linha.coleta.entradasDoGestor} entrada
              {linha.coleta.entradasDoGestor === 1 ? "" : "s"} e {linha.coleta.saidasDoGestor} saída
              {linha.coleta.saidasDoGestor === 1 ? "" : "s"}. O que você digitar entra <em>além</em> disso.
            </p>
          ) : null}

          <div>
            <Botao variante="secundario" onClick={() => setPreenchendo(true)}>
              Preencher à mão
            </Botao>
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * O texto que vai no WhatsApp.
 *
 * Curto de propósito: o `wa.me` só transporta texto, e mensagem longa aparece
 * truncada na conversa. O que o gestor precisa saber está no link — a página
 * mostra a empresa, o mês e os prazos. Aqui vai só o convite.
 *
 * Sem CNPJ e sem nada do contrato: a mensagem é encaminhável, e o nome fantasia
 * basta para o gestor reconhecer que é dele.
 */
function textoDoConvite(cliente: string, linha: LinhaDoControle, url: string): string {
  const mes = nomeDoMes(linha.competencia);
  const prazo = linha.datas.informar ? ` até ${formatarData(linha.datas.informar)}` : "";
  return [
    `Olá! Aqui é da MX Corretora de Seguros.`,
    ``,
    `Para fechar a fatura de ${mes} do seguro da ${cliente}, precisamos saber quem entrou e quem saiu no mês.`,
    ``,
    `É rápido, pelo celular${prazo}:`,
    url,
    ``,
    `Se ninguém entrou nem saiu, dá para confirmar isso no mesmo link.`,
  ].join("\n");
}

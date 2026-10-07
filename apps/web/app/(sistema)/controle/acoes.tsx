"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Botao } from "@/componentes/ui/botao";
import { Modal } from "@/componentes/ui/modal";
import { Aviso, useAviso } from "@/componentes/ui/aviso";
import { proximoPasso, ROTULO_PASSO } from "@/lib/dominio/controle";
import {
  canaisPossiveis,
  linkEmail,
  linkWhatsapp,
  montarMensagem,
  ROTULO_CANAL,
  ROTULO_MODELO,
} from "@/lib/dominio/mensagem";
import { nomeCurto } from "@/lib/dominio/cliente";
import type { LinhaDoControle, ModeloSalvo } from "@/lib/controles/consulta";

import { abrirNoOutlook, abrirNoWhatsapp, baixarArquivo } from "@/componentes/abrir-mensagem";

import { AnexarBoleto } from "./anexar-boleto";
import { MarcarPago } from "./marcar-pago";

/**
 * O botão da coluna "Próximo passo" e a janela de enviar mensagem.
 *
 * A mensagem que sai é SEMPRE a do passo atual — a analista não escolhe o
 * modelo, escolhe o momento. Escolher os dois seria mandar aviso de vencimento
 * a quem ainda não recebeu boleto.
 *
 * O texto vem do modelo salvo em Configurações, já preenchido com os dados
 * deste cliente. Dá para ajustar antes de enviar, e o ajuste vale só para este
 * envio: o modelo continua como está.
 */
export function Acoes({ linha, modelos }: { linha: LinhaDoControle; modelos: ModeloSalvo[] }) {
  const router = useRouter();
  const aviso = useAviso();
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const passo = proximoPasso(linha.passo);
  const cliente = nomeCurto({ razaoSocial: linha.razaoSocial, nomeFantasia: linha.nomeFantasia });

  if (passo.tipo === "nenhum") {
    return <span className="text-[12px] text-faint">concluída</span>;
  }

  if (passo.tipo === "anexar_boleto") {
    return <AnexarBoleto linha={linha} rotulo={passo.rotulo} />;
  }

  if (passo.tipo === "marcar_pago") {
    return <MarcarPago linha={linha} rotulo={passo.rotulo} />;
  }

  /**
   * Em `informar` a ação é mandar o LINK, e não abrir a janela de mensagem.
   * Decisão de 05/10: o WhatsApp é prioridade, e a tela da coleta abre a
   * conversa com o link pronto num clique.
   */
  if (passo.tipo === "coleta") {
    return (
      <a
        href={`/controle/${linha.id}/coleta`}
        className="inline-flex h-8 items-center whitespace-nowrap rounded-[6px] font-(family-name:--font-display) bg-brand px-2.5 text-[12px] font-[600] text-on-brand hover:bg-brand-hover"
      >
        {passo.rotulo}
      </a>
    );
  }

  if (passo.tipo === "conferir") {
    return (
      <a
        href={`/controle/${linha.id}/conferir`}
        className="inline-flex h-8 items-center whitespace-nowrap rounded-[6px] font-(family-name:--font-display) border border-line-strong px-2.5 text-[12px] font-[600] text-heading hover:bg-surface-2"
      >
        {passo.rotulo}
      </a>
    );
  }

  const modeloSalvo = modelos.find((m) => m.modelo === passo.modelo);
  const canais = canaisPossiveis(linha.canal, { celular: linha.gestorCelular, email: linha.gestorEmail });
  const semDestino = !canais.whatsapp && !canais.email;

  function contexto() {
    return {
      cliente,
      gestor: linha.gestorNome,
      competencia: linha.competencia,
      data: linha.datas.informar,
      dataCorte: linha.datas.corte,
      dataBoleto: linha.datas.boleto,
      dataVencimento: linha.datas.vencimento,
      valorDoBoleto: linha.valorDoBoleto,
      // Nas etapas desta janela (corte, boleto, vencimento) não há link a
      // mandar: o de coleta vai na etapa "Enviar link".
      link: "",
      seguradora: linha.seguradora,
      analista: linha.analista,
    };
  }

  function montarTexto(): string {
    return modeloSalvo ? montarMensagem(modeloSalvo.corpo, contexto()) : "";
  }

  function abrir() {
    setTexto(montarTexto());
    setAberto(true);
  }

  async function registrar(canal: "email" | "whatsapp") {
    setOcupado(true);
    try {
      const resposta = await fetch(`/api/v1/controles/${linha.id}/mensagem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canal, texto }),
      });
      const json = await resposta.json().catch(() => null);

      if (!resposta.ok) {
        aviso.mostrar(json?.error?.message ?? "Não foi possível registrar o envio.");
        return false;
      }

      aviso.mostrar(
        canal === "email"
          ? comPdf
            ? "Registrado. Arraste o PDF baixado para o e-mail no Outlook e clique em Enviar."
            : "Registrado. Revise e clique em Enviar no Outlook que abriu."
          : "Registrado. Envie pela janela do WhatsApp que abriu.",
      );
      setAberto(false);
      router.refresh();
      return true;
    } catch {
      aviso.mostrar("Não foi possível falar com o servidor.");
      return false;
    } finally {
      setOcupado(false);
    }
  }

  // Mensagem de boleto com PDF anexado ao mês: o Outlook abre e o PDF baixa junto.
  const comPdf = passo.tipo === "mensagem" && passo.modelo === "boleto" && Boolean(linha.boletoArquivoId);

  function peloWhatsapp() {
    const destino = linkWhatsapp(linha.gestorCelular, texto);
    if (!destino) {
      aviso.mostrar("Este cliente não tem celular cadastrado.");
      return;
    }
    abrirNoWhatsapp(destino);
    void registrar("whatsapp");
  }

  function peloOutlook() {
    const assunto = modeloSalvo ? montarMensagem(modeloSalvo.assunto, contexto()) : cliente;
    const destino = linkEmail(linha.gestorEmail, assunto, texto);
    if (!destino) {
      aviso.mostrar("Este cliente não tem e-mail cadastrado.");
      return;
    }
    abrirNoOutlook(destino);
    if (comPdf && linha.boletoArquivoId) baixarArquivo(linha.boletoArquivoId);
    void registrar("email");
  }

  return (
    <>
      <span className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <Botao
          variante={linha.passo === "informar" ? "primario" : "secundario"}
          onClick={abrir}
          tamanho="compacto"
        >
          {passo.rotulo}
        </Botao>

        {/* Em `boleto` a mensagem é a ação principal, mas o cliente que paga no
            dia em que recebe não deveria esperar o passo virar sozinho. */}
        {linha.passo === "boleto" ? (
          <MarcarPago linha={linha} rotulo="Marcar pago" variante="texto" />
        ) : null}
      </span>

      <Modal
        aberto={aberto}
        titulo={`Mensagem de ${ROTULO_MODELO[passo.modelo].toLowerCase()}`}
        descricao={`${cliente} · etapa ${ROTULO_PASSO[linha.passo].toLowerCase()} · canal ${ROTULO_CANAL[linha.canal].toLowerCase()}`}
        onFechar={() => setAberto(false)}
        largura="larga"
        acoes={
          <>
            <Botao variante="secundario" onClick={() => setAberto(false)}>
              Cancelar
            </Botao>
            {canais.whatsapp ? (
              <Botao variante="whatsapp" onClick={peloWhatsapp} disabled={ocupado || !texto.trim()}>
                Abrir o WhatsApp
              </Botao>
            ) : null}
            {canais.email ? (
              <Botao onClick={peloOutlook} disabled={ocupado || !texto.trim()}>
                {comPdf ? "Abrir no Outlook e baixar o PDF" : "Abrir no Outlook"}
              </Botao>
            ) : null}
          </>
        }
      >
        {!modeloSalvo ? (
          <p role="alert" className="rounded-[8px] border border-warn bg-warn-soft p-3 text-[13.5px] text-texto">
            O modelo desta mensagem não está cadastrado. Configurações › Mensagens.
          </p>
        ) : semDestino ? (
          <p role="alert" className="rounded-[8px] border border-warn bg-warn-soft p-3 text-[13.5px] text-texto">
            Este cliente está com canal {ROTULO_CANAL[linha.canal].toLowerCase()}, mas não tem{" "}
            {linha.canal === "email" ? "e-mail" : "celular"} cadastrado. Abra o cadastro para completar.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="texto-da-mensagem"
                className="font-(family-name:--font-display) text-[12.5px] font-[600] text-heading"
              >
                Mensagem
              </label>
              <textarea
                id="texto-da-mensagem"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={9}
                className="w-full rounded-[8px] border border-line-strong bg-surface px-3 py-2.5 text-[14px] leading-relaxed text-heading outline-none focus:border-brand"
              />
              <span className="text-[12px] text-muted">
                O ajuste vale só para este envio. O modelo fica em Configurações › Mensagens.
              </span>
            </div>

            <dl className="flex flex-wrap gap-x-6 gap-y-1 text-[12.5px]">
              {canais.whatsapp ? (
                <div className="flex gap-1.5">
                  <dt className="text-muted">WhatsApp:</dt>
                  <dd className="tabular text-heading">{linha.gestorCelular}</dd>
                </div>
              ) : null}
              {canais.email ? (
                <div className="flex gap-1.5">
                  <dt className="text-muted">E-mail:</dt>
                  <dd className="text-heading">{linha.gestorEmail}</dd>
                </div>
              ) : null}
            </dl>

            {canais.email ? (
              <p className="rounded-[8px] bg-surface-2 px-3 py-2.5 text-[12.5px] leading-relaxed text-texto">
                O Outlook deste computador abre com destinatário, assunto e texto prontos. Revise e clique em
                Enviar.{comPdf ? " O PDF do boleto baixa junto: arraste o arquivo para o e-mail." : ""}
              </p>
            ) : null}

            {canais.whatsapp ? (
              <p className="rounded-[8px] bg-surface-2 px-3 py-2.5 text-[12.5px] leading-relaxed text-texto">
                O WhatsApp abre com o texto pronto, e o envio fica com você. O sistema registra que a conversa foi
                aberta — ele não tem como saber se a mensagem foi entregue.
              </p>
            ) : null}
          </div>
        )}
      </Modal>

      <Aviso estado={aviso.estado} onFechar={aviso.fechar} />
    </>
  );
}

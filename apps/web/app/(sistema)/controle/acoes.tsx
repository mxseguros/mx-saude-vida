"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Botao } from "@/componentes/ui/botao";
import { Modal } from "@/componentes/ui/modal";
import { Aviso, useAviso } from "@/componentes/ui/aviso";
import { proximoPasso, ROTULO_PASSO } from "@/lib/dominio/controle";
import {
  canaisPossiveis,
  linkWhatsapp,
  montarMensagem,
  ROTULO_CANAL,
  ROTULO_MODELO,
} from "@/lib/dominio/mensagem";
import { nomeCurto } from "@/lib/dominio/cliente";
import type { LinhaDoControle, ModeloSalvo } from "@/lib/controles/consulta";

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

  if (passo.tipo === "conferir") {
    // A tela de conferir a planilha chega adiante na Sprint 4. Até lá o botão
    // leva ao cliente, que é onde a analista consegue fazer alguma coisa —
    // botão que não faz nada é pior que botão ausente.
    return (
      <a
        href={`/clientes/${linha.clienteId}`}
        className="inline-flex min-h-[32px] items-center rounded-[6px] border border-line-strong px-2.5 text-[12px] font-[600] text-heading hover:bg-surface-2"
      >
        {passo.rotulo}
      </a>
    );
  }

  const modeloSalvo = modelos.find((m) => m.modelo === passo.modelo);
  const canais = canaisPossiveis(linha.canal, { celular: linha.gestorCelular, email: linha.gestorEmail });
  const semDestino = !canais.whatsapp && !canais.email;

  function montarTexto(): string {
    if (!modeloSalvo) return "";
    return montarMensagem(modeloSalvo.corpo, {
      cliente,
      gestor: linha.gestorNome,
      competencia: linha.competencia,
      data: linha.datas.informar,
      dataCorte: linha.datas.corte,
      dataBoleto: linha.datas.boleto,
      dataVencimento: linha.datas.vencimento,
      valorDoBoleto: linha.valorDoBoleto,
      link: typeof window === "undefined" ? "" : `${window.location.origin}/portal`,
      seguradora: linha.seguradora,
      analista: linha.analista,
    });
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
          ? `E-mail enviado para ${linha.gestorEmail}.`
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

  function peloWhatsapp() {
    const destino = linkWhatsapp(linha.gestorCelular, texto);
    if (!destino) {
      aviso.mostrar("Este cliente não tem celular cadastrado.");
      return;
    }

    // A janela nasce do CLIQUE, e não depois do `await`: aberta depois da ida
    // à rede, o bloqueador de pop-up a barra. E sem `noopener`, porque com ele
    // `window.open` devolve null por especificação e o código abriria uma
    // segunda janela; o opener é zerado logo em seguida, que protege igual.
    const janela = window.open(destino, "_blank");
    if (janela) janela.opener = null;

    void registrar("whatsapp");
  }

  return (
    <>
      <span className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <Botao
          variante={linha.passo === "informar" ? "primario" : "secundario"}
          onClick={abrir}
          className="min-h-[32px] px-2.5 text-[12px] sm:min-h-[32px]"
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
              <Botao onClick={() => void registrar("email")} disabled={ocupado || !texto.trim()}>
                {ocupado ? "Enviando…" : "Enviar e-mail"}
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

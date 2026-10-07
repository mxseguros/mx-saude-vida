"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { abrirNoOutlook, abrirNoWhatsapp, baixarArquivo } from "@/componentes/abrir-mensagem";
import { Botao } from "@/componentes/ui/botao";
import { useAviso } from "@/componentes/ui/aviso";
import { linkEmail, linkWhatsapp } from "@/lib/dominio/mensagem";

/**
 * O botão de uma mensagem da fila: abre no Outlook (com o PDF do boleto junto)
 * ou no WhatsApp, e marca como enviada. A abertura vem antes da ida à rede.
 */
export function EnviarPendente({
  id,
  canal,
  destino,
  assunto,
  corpo,
  boletoArquivoId,
}: {
  id: number;
  canal: "email" | "whatsapp";
  destino: string;
  assunto: string | null;
  corpo: string;
  boletoArquivoId: string | null;
}) {
  const router = useRouter();
  const aviso = useAviso();
  const [ocupado, setOcupado] = useState(false);

  async function enviar() {
    const link = canal === "email" ? linkEmail(destino, assunto ?? "", corpo) : linkWhatsapp(destino, corpo);
    if (!link) {
      aviso.mostrar(canal === "email" ? "O e-mail do cadastro não é válido." : "O celular do cadastro não é válido.");
      return;
    }
    if (canal === "email") {
      abrirNoOutlook(link);
      if (boletoArquivoId) baixarArquivo(boletoArquivoId);
    } else {
      abrirNoWhatsapp(link);
    }

    setOcupado(true);
    try {
      const resposta = await fetch(`/api/v1/mensagens/${id}/enviada`, { method: "POST" });
      const json = await resposta.json().catch(() => null);
      aviso.mostrar(
        resposta.ok
          ? canal === "email" && boletoArquivoId
            ? "Arraste o PDF baixado para o e-mail no Outlook e clique em Enviar."
            : "Registrado. Revise e envie na janela que abriu."
          : (json?.error?.message ?? "Não foi possível registrar o envio."),
      );
      if (resposta.ok) router.refresh();
    } catch {
      aviso.mostrar("Não foi possível falar com o servidor.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Botao variante={canal === "whatsapp" ? "whatsapp" : "primario"} onClick={() => void enviar()} disabled={ocupado}>
      {canal === "whatsapp" ? "Abrir o WhatsApp" : boletoArquivoId ? "Abrir no Outlook e baixar o PDF" : "Abrir no Outlook"}
    </Botao>
  );
}

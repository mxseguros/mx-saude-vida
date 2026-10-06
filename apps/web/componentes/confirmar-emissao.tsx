"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Botao } from "@/componentes/ui/botao";
import { useAviso } from "@/componentes/ui/aviso";

/** O botão "Confirmar" da 5ª data: grava na hora e o alerta some no refresh. */
export function ConfirmarEmissao({
  controleId,
  variante = "primario",
}: {
  controleId: string;
  variante?: "primario" | "secundario" | "texto";
}) {
  const router = useRouter();
  const aviso = useAviso();
  const [ocupado, setOcupado] = useState(false);

  async function confirmar() {
    setOcupado(true);
    try {
      const resposta = await fetch(`/api/v1/controles/${controleId}/emissao`, { method: "POST" });
      const json = await resposta.json().catch(() => null);
      aviso.mostrar(resposta.ok ? "Emissão confirmada." : (json?.error?.message ?? "Não foi possível confirmar."));
      if (resposta.ok) router.refresh();
    } catch {
      aviso.mostrar("Não foi possível falar com o servidor.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Botao variante={variante} onClick={() => void confirmar()} disabled={ocupado}>
      {ocupado ? "Confirmando…" : "Confirmar"}
    </Botao>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Botao } from "@/componentes/ui/botao";
import { Aviso, useAviso } from "@/componentes/ui/aviso";

/**
 * Abrir a competência à mão.
 *
 * O cron faz isso toda manhã; este botão existe para o primeiro mês e para
 * quando um cliente é cadastrado depois da abertura — sem ele, a analista
 * esperaria até o dia seguinte para ver um cliente novo na fila.
 *
 * É idempotente no banco (`unique (client_id, competence)`), então clicar
 * duas vezes não duplica nada: a segunda vez abre só quem faltava.
 */
export function AbrirMes({ competencia }: { competencia: string }) {
  const router = useRouter();
  const aviso = useAviso();
  const [ocupado, setOcupado] = useState(false);

  async function abrir() {
    setOcupado(true);
    try {
      const resposta = await fetch("/api/v1/controles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competencia }),
      });
      const json = await resposta.json().catch(() => null);

      if (!resposta.ok) {
        aviso.mostrar(json?.error?.message ?? "Não foi possível abrir o mês.");
        return;
      }

      const { abertos, jaExistiam } = json.data as { abertos: number; jaExistiam: number };
      aviso.mostrar(
        abertos === 0
          ? jaExistiam
            ? "Todos os clientes já estavam no mês."
            : "Nenhum cliente ativo para abrir."
          : `${abertos} ${abertos === 1 ? "cliente entrou" : "clientes entraram"} no mês.`,
      );
      router.refresh();
    } catch {
      aviso.mostrar("Não foi possível falar com o servidor.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      <Botao variante="secundario" onClick={abrir} disabled={ocupado}>
        {ocupado ? "Abrindo…" : "Abrir o mês"}
      </Botao>
      <Aviso estado={aviso.estado} onFechar={aviso.fechar} />
    </>
  );
}

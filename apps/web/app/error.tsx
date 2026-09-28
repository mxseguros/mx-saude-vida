"use client";

import { useEffect } from "react";

import { Botao, LinkBotao } from "@/componentes/ui/botao";
import { LockupMX } from "@/componentes/marca";

/**
 * Tela de erro de execução.
 *
 * Sem ela, uma exceção não tratada numa página derruba a árvore inteira na
 * página de erro do Next — em inglês, e em produção sem nenhuma indicação do
 * que fazer a seguir.
 *
 * O que ela NÃO faz: mostrar a mensagem do erro. `error.message` numa esteira
 * do Controle pode carregar o pedaço da consulta que falhou, com número de
 * apólice ou nome de segurado dentro. A pessoa recebe o `digest`, que é o
 * identificador que casa com o log do servidor — e é isso que se pede ao
 * suporte, não um texto que ela teria que transcrever.
 */
export default function Erro({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Enquanto não há Sentry (Fase 5), o console do servidor da Vercel é onde
    // isto é indexado. Registrar aqui garante que o erro exista em algum lugar
    // mesmo quando ninguém abre um chamado.
    console.error("Falha na tela:", error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center px-6 py-12">
      <div className="w-full max-w-[420px]">
        <div className="mb-8 text-heading">
          <LockupMX altura={24} titulo="MX Corretora de seguros" />
        </div>

        <p className="rotulo">Algo falhou</p>
        <h1 className="mt-1 text-[26px] font-[800] leading-tight">
          Não foi possível carregar esta tela
        </h1>
        <p className="mt-2 text-[14px] text-muted">
          A falha foi registrada. Tentar de novo costuma resolver quando é
          conexão; se repetir, avise o suporte com o código abaixo.
        </p>

        {error.digest ? (
          <p className="tabular mt-4 rounded-[6px] border border-line bg-surface-2 px-3 py-2 text-[12.5px] text-muted">
            Código: <b className="text-heading">{error.digest}</b>
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Botao onClick={reset}>Tentar de novo</Botao>
          <LinkBotao href="/controle" variante="secundario">
            Voltar para a esteira
          </LinkBotao>
        </div>
      </div>
    </main>
  );
}

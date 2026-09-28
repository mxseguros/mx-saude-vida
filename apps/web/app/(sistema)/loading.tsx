/**
 * O que aparece enquanto a próxima tela carrega.
 *
 * Só agora isso é possível: com a `Moldura` dentro de cada página, um esqueleto
 * fazia a sidebar sumir e voltar a cada navegação — pior do que não ter. Com
 * ela no layout do grupo, o React preserva o menu e troca só o conteúdo, que é
 * exatamente o que a pessoa está esperando ver mudar.
 *
 * É um bloco cinza, não uma cópia da tela. Esqueleto que imita colunas de
 * board, linhas de tabela e cartões precisa ser mantido junto com cada uma
 * delas, e o dia em que divergir mostra uma tela que não existe. O que ele
 * promete é só: "chegou o comando, o conteúdo vem".
 *
 * `aria-hidden` porque não há informação aqui; o `role="status"` com o texto
 * é o que o leitor de tela anuncia, uma vez.
 */
export default function Carregando() {
  return (
    <div className="p-4 sm:p-6">
      <p role="status" className="sr-only">
        Carregando…
      </p>

      <div aria-hidden="true" className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div className="h-7 w-[220px] animate-pulse rounded-[6px] bg-surface-2" />
          <div className="h-9 w-[130px] animate-pulse rounded-[8px] bg-surface-2" />
        </div>

        <div className="h-[60vh] animate-pulse rounded-[10px] bg-surface-2" />
      </div>
    </div>
  );
}

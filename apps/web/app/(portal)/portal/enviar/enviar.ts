import type { ArquivoGravado } from "@/lib/arquivos/servico";

/**
 * As idas ao servidor do envio da planilha.
 *
 * Separado do componente porque é a parte que tem contrato com a rota e merece
 * ser lida sem o JSX no meio.
 */

export type RespostaDeUpload = { ok: true; arquivo: ArquivoGravado } | { ok: false; mensagem: string };

/**
 * Upload com progresso.
 *
 * `fetch` não expõe o progresso de envio; `XMLHttpRequest` expõe. É a diferença
 * entre uma barra com "62%" e uma tela cinza que não diz se travou — e quem está
 * no celular, com a planilha vinda do Drive, precisa da primeira.
 */
export function enviarPlanilhaComProgresso(
  controleId: string,
  arquivo: File,
  onProgresso: (porcento: number) => void,
): Promise<RespostaDeUpload> {
  return new Promise((resolver) => {
    const corpo = new FormData();
    corpo.append("arquivo", arquivo);
    corpo.append("controle", controleId);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/portal/planilha");

    xhr.upload.onprogress = (evento) => {
      if (!evento.lengthComputable) return;
      // Para em 99: os 100% são do servidor respondendo, não do byte subindo.
      // Mostrar 100 e continuar esperando faz a pessoa achar que travou.
      onProgresso(Math.min(99, Math.round((evento.loaded / evento.total) * 100)));
    };

    xhr.onload = () => {
      let json: { data?: ArquivoGravado; error?: { message?: string } } | null = null;
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        json = null;
      }

      if (xhr.status >= 200 && xhr.status < 300 && json?.data) {
        resolver({ ok: true, arquivo: json.data });
      } else {
        resolver({ ok: false, mensagem: json?.error?.message ?? "Não foi possível enviar o arquivo." });
      }
    };

    xhr.onerror = () =>
      resolver({ ok: false, mensagem: "A conexão caiu durante o envio. Tente de novo em instantes." });

    xhr.send(corpo);
  });
}

export type RespostaDoEnvio =
  | { ok: true; protocolo: string | null }
  | { ok: false; mensagem: string; recomeçar?: boolean };

/**
 * O envio de verdade: move o mês e avisa a MX.
 *
 * `recomeçar` volta `true` no 409, que é o caso de o mês ter mudado de etapa
 * enquanto a aba ficou aberta. A tela usa isso para oferecer "atualizar" em vez
 * de deixar a pessoa clicando em Enviar contra um estado que não existe mais.
 */
export async function confirmarEnvio(dados: {
  controle: string;
  arquivo: string | null;
  observacao: string | null;
  semMudancas: boolean;
}): Promise<RespostaDoEnvio> {
  try {
    const resposta = await fetch("/api/portal/envio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
    });

    const json = await resposta.json().catch(() => null);

    if (resposta.ok) return { ok: true, protocolo: (json?.data?.protocolo as string | null) ?? null };

    return {
      ok: false,
      mensagem: json?.error?.message ?? "Não foi possível enviar agora.",
      recomeçar: resposta.status === 409,
    };
  } catch {
    return {
      ok: false,
      mensagem: "Não foi possível falar com o servidor. O que você preencheu continua aqui.",
    };
  }
}

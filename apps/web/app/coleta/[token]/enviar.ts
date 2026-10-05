/**
 * O que o navegador do gestor manda para a rota pública.
 *
 * Nenhuma regra mora aqui: a validação é o esquema zod do domínio, que roda nos
 * dois lados, e a decisão é da rota. Este arquivo só fala HTTP, e traduz falha
 * de rede em frase que diz o que fazer.
 */

export type ErroDeEnvio = {
  mensagem: string;
  /** Por campo, como o formulário consome: `entradas.0.documento` → mensagem. */
  erros?: Record<string, string>;
};

/**
 * Sobe a planilha, com progresso.
 *
 * `fetch` não expõe o progresso de envio; `XMLHttpRequest` expõe. É a diferença
 * entre uma barra com "62%" e uma tela parada que não diz se travou — e quem
 * está no 4G com uma planilha de 2 MB precisa da primeira.
 */
export function enviarPlanilhaComProgresso(
  token: string,
  arquivo: File,
  onProgresso: (porcento: number) => void,
): Promise<{ ok: true; id: string; nome: string } | { ok: false; mensagem: string }> {
  return new Promise((resolver) => {
    const corpo = new FormData();
    corpo.append("arquivo", arquivo);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/coleta/${encodeURIComponent(token)}/planilha`);

    xhr.upload.onprogress = (e) => {
      // Nunca 100 aqui: o upload acabou, mas o servidor ainda está gravando a
      // ficha. Mostrar 100 e depois falhar seria mentir duas vezes.
      if (e.lengthComputable) onProgresso(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };

    xhr.onload = () => {
      const json = lerJson(xhr.responseText);
      const id = (json?.data as { id?: string } | undefined)?.id;
      const nome = (json?.data as { nome?: string } | undefined)?.nome;
      if (xhr.status >= 200 && xhr.status < 300 && id) {
        resolver({ ok: true, id, nome: nome ?? arquivo.name });
      } else {
        resolver({ ok: false, mensagem: mensagemDe(json) ?? "Não foi possível enviar a planilha." });
      }
    };

    xhr.onerror = () =>
      resolver({ ok: false, mensagem: "A conexão caiu durante o envio. Tente de novo em instantes." });

    xhr.send(corpo);
  });
}

export async function enviarColeta(
  token: string,
  dados: unknown,
): Promise<{ ok: true; protocolo: string; correcao: boolean } | { ok: false; falha: ErroDeEnvio }> {
  try {
    const resposta = await fetch(`/api/coleta/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
    });

    const json = lerJson(await resposta.text());

    if (resposta.ok) {
      const data = (json?.data ?? {}) as { protocolo?: string; correcao?: boolean };
      return { ok: true, protocolo: data.protocolo ?? "", correcao: data.correcao === true };
    }

    const lista = (json?.error as { fields?: { campo: string; mensagem: string }[] } | undefined)?.fields;

    return {
      ok: false,
      falha: {
        mensagem: mensagemDe(json) ?? "Não foi possível enviar.",
        erros: lista?.length ? Object.fromEntries(lista.map((e) => [e.campo, e.mensagem])) : undefined,
      },
    };
  } catch {
    // O que ele digitou continua na tela: o estado é do React, e nada foi
    // limpo. Dizer isso é o que evita o gestor achar que perdeu tudo.
    return {
      ok: false,
      falha: { mensagem: "Não consegui falar com o servidor. O que você preencheu continua aqui." },
    };
  }
}

function lerJson(texto: string): { data?: unknown; error?: unknown } | null {
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

function mensagemDe(json: { error?: unknown } | null): string | null {
  const erro = json?.error as { message?: string } | undefined;
  return typeof erro?.message === "string" ? erro.message : null;
}

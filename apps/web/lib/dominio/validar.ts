import { z } from "zod";

/**
 * A ponte entre o zod e a resposta da rota.
 *
 * O MESMO esquema roda no navegador e no servidor. A rota recusa sozinha e
 * devolve TODOS os erros de uma vez, cada um apontando o campo culpado — um
 * formulário que corrige um erro por vez faz a pessoa enviar cinco vezes.
 */

export type ErroDeCampo = { campo: string; mensagem: string };

export type Validacao<T> =
  | { ok: true; dados: T }
  | { ok: false; erros: ErroDeCampo[] };

export function validar<Saida, Def extends z.ZodTypeDef, Entrada>(
  // Entrada e Saida sao parametros separados porque `.default()` e
  // `.transform()` fazem o tipo de ENTRADA divergir do de SAIDA: um campo com
  // valor padrao e opcional ao enviar e obrigatorio depois de validado. Um
  // `ZodType<T>` so com a saida recusaria os proprios esquemas do projeto.
  esquema: z.ZodType<Saida, Def, Entrada>,
  entrada: unknown,
): Validacao<Saida> {
  const analise = esquema.safeParse(entrada);
  if (analise.success) return { ok: true, dados: analise.data };

  return {
    ok: false,
    erros: analise.error.issues.map((problema) => ({
      campo: problema.path.join(".") || "formulario",
      mensagem: problema.message,
    })),
  };
}

/** Os erros por campo, como o formulário os consome. */
export function porCampo(erros: readonly ErroDeCampo[]): Record<string, string> {
  const mapa: Record<string, string> = {};
  for (const erro of erros) {
    // O PRIMEIRO erro de cada campo vence: é o mais específico, e dois
    // recados no mesmo campo brigam por espaço.
    if (!(erro.campo in mapa)) mapa[erro.campo] = erro.mensagem;
  }
  return mapa;
}

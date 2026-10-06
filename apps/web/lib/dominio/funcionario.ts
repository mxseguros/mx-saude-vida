/**
 * Funcionários: a base de vidas de cada cliente (protótipo v0.7, tFunc).
 *
 * Puro. Uma linha por vínculo: demitir fecha a linha, readmitir abre outra com
 * o mesmo CPF, e o histórico fica inteiro.
 */

import { z } from "zod";

import type { Capital } from "./apolice";
import { cpfValido, limparDocumento } from "./documento";
import { hojeSaoPaulo } from "./hoje";
import { dataBrParaIso, valorParaNumero } from "./mascaras";
import type { LinhaDaPlanilha } from "./planilha";

export type Funcionario = {
  id: string;
  nome: string;
  documento: string | null;
  nascimento: string | null;
  cargo: string | null;
  salario: number | null;
  setor: string | null;
  gestor: string | null;
  admissao: string | null;
  saida: string | null;
  motivo: string | null;
};

export const ativo = (f: Pick<Funcionario, "saida">) => f.saida === null;

/* --------------------------------------------------------------------------
   Formulários
   -------------------------------------------------------------------------- */

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const opcional = (max: number) =>
  z.preprocess(texto, z.string().max(max, `Máximo de ${max} caracteres.`)).transform((v) => v || null);
const data = (rotulo: string, obrigatoria = false) =>
  z
    .preprocess(
      texto,
      z
        .string()
        .refine((v) => !obrigatoria || v !== "", { message: `Informe ${rotulo}.` })
        .refine((v) => v === "" || dataBrParaIso(v) !== null, { message: "Data inválida: use dd/mm/aaaa." })
        .refine((v) => v === "" || (dataBrParaIso(v) ?? "") > "1900-01-01", { message: "Confira o ano." }),
    )
    .transform((v) => (v ? dataBrParaIso(v) : null));

/** O mesmo esquema na tela e na rota (regra 3). */
export const esquemaFuncionario = z
  .object({
    nome: z.preprocess(texto, z.string().min(3, "Informe o nome completo.").max(120)),
    documento: z
      .preprocess(
        (v) => limparDocumento(texto(v)),
        z.string().refine((d) => d === "" || cpfValido(d), { message: "CPF inválido." }),
      )
      .transform((v) => v || null),
    nascimento: data("o nascimento").refine((v) => v === null || v <= hojeSaoPaulo(), {
      message: "O nascimento está no futuro.",
    }),
    cargo: opcional(80),
    salario: z
      .preprocess(
        texto,
        z.string().refine((v) => v === "" || (valorParaNumero(v) ?? -1) >= 0, { message: "Valor inválido." }),
      )
      .transform((v) => (v ? valorParaNumero(v) : null)),
    setor: opcional(80),
    gestor: opcional(120),
    admissao: data("a admissão"),
  });

export type DadosDoFuncionario = z.infer<typeof esquemaFuncionario>;

export const esquemaDemissao = z.object({
  saida: data("a data de saída", true),
  motivo: opcional(200),
});

/* --------------------------------------------------------------------------
   Capital pela apólice
   -------------------------------------------------------------------------- */

const chave = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

/**
 * O capital de UMA vida, pela regra da apólice.
 *
 * `null` quando não dá para saber — e não zero: capital desconhecido é outra
 * coisa que capital zero. Por cargo sem cargo que case, por cobertura (é
 * apólice individual, sem um capital só) e "não consta" caem aqui.
 */
export function capitalDoFuncionario(
  capital: Capital | null,
  f: Pick<Funcionario, "cargo" | "salario">,
): number | null {
  if (!capital) return null;
  if (capital.tipo === "per_capita") return capital.valor;
  if (capital.tipo === "multiplo_salarial") return f.salario === null ? null : f.salario * capital.multiplo;
  if (capital.tipo === "por_cargo") {
    if (!f.cargo) return null;
    const achada = capital.faixas.find((x) => chave(x.rotulo) === chave(f.cargo ?? ""));
    return achada ? achada.capital : null;
  }
  return null;
}

export type Resumo = {
  ativos: number;
  demitidos: number;
  capitalTotal: number;
  /** Vidas ativas cujo capital não deu para calcular. */
  semCapital: number;
  /** Capital total × taxa por mil. `null` sem taxa na apólice. */
  premioPrevisto: number | null;
};

export function resumir(
  lista: readonly Funcionario[],
  apolice: { capital: Capital | null; taxaPorMil: number | null } | null,
): Resumo {
  const ativos = lista.filter(ativo);
  let capitalTotal = 0;
  let semCapital = 0;
  for (const f of ativos) {
    const c = capitalDoFuncionario(apolice?.capital ?? null, f);
    if (c === null) semCapital += 1;
    else capitalTotal += c;
  }
  const taxa = apolice?.taxaPorMil ?? null;
  return {
    ativos: ativos.length,
    demitidos: lista.length - ativos.length,
    capitalTotal,
    semCapital,
    premioPrevisto: taxa === null ? null : Math.round(((capitalTotal * taxa) / 1000) * 100) / 100,
  };
}

/* --------------------------------------------------------------------------
   Importação
   -------------------------------------------------------------------------- */

export type ItemDaImportacao = {
  linha: number;
  dados: Omit<Funcionario, "id" | "saida" | "motivo">;
  /** Para atualizar: o vínculo ativo que já tem este CPF. */
  existenteId?: string;
};

export type PlanoDeImportacao = {
  novos: ItemDaImportacao[];
  atualizar: ItemDaImportacao[];
  /** CPF que existe só como demitido: entra como vínculo novo. */
  readmitir: ItemDaImportacao[];
  ignorados: { linha: number; motivo: string }[];
};

/**
 * O que a planilha muda na base, sem gravar nada.
 *
 * A chave é o CPF. Quem já está ativo é ATUALIZADO só no que a planilha traz
 * preenchido — célula vazia não apaga dado que a MX já tinha. Quem não está na
 * planilha NÃO é demitido: a planilha do cliente nem sempre traz todo mundo, e
 * demitir por ausência tiraria cobertura de quem continua trabalhando.
 */
export function planoDeImportacao(
  existentes: readonly Funcionario[],
  linhas: readonly LinhaDaPlanilha[],
): PlanoDeImportacao {
  const plano: PlanoDeImportacao = { novos: [], atualizar: [], readmitir: [], ignorados: [] };
  const ativosPorCpf = new Map(existentes.filter((f) => ativo(f) && f.documento).map((f) => [f.documento!, f]));
  const demitidos = new Set(existentes.filter((f) => !ativo(f) && f.documento).map((f) => f.documento!));
  const vistos = new Set<string>();

  for (const l of linhas) {
    if (!l.nome) {
      plano.ignorados.push({ linha: l.numero, motivo: "Sem nome." });
      continue;
    }
    if (!l.cpf || !cpfValido(l.cpf)) {
      plano.ignorados.push({ linha: l.numero, motivo: l.cpf ? "CPF não confere." : "Sem CPF." });
      continue;
    }
    if (vistos.has(l.cpf)) {
      plano.ignorados.push({ linha: l.numero, motivo: "CPF repetido na planilha." });
      continue;
    }
    vistos.add(l.cpf);

    const dados = {
      nome: l.nome,
      documento: l.cpf,
      nascimento: l.nascimento,
      cargo: l.cargo,
      salario: l.salario,
      setor: l.setor,
      gestor: l.gestor,
      admissao: l.admissao,
    };

    const atual = ativosPorCpf.get(l.cpf);
    if (atual) plano.atualizar.push({ linha: l.numero, dados, existenteId: atual.id });
    else if (demitidos.has(l.cpf)) plano.readmitir.push({ linha: l.numero, dados });
    else plano.novos.push({ linha: l.numero, dados });
  }
  return plano;
}

/** "***.***.048-24": a lista mostra só o fim do CPF; o completo fica na edição. */
export function cpfOculto(documento: string | null): string {
  if (!documento || documento.length !== 11) return "—";
  return `***.***.${documento.slice(6, 9)}-${documento.slice(9)}`;
}

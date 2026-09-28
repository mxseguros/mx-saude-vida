import type { Metadata } from "next";
import { LockupMX } from "@/componentes/marca";
import { Icone, type NomeDoIcone } from "@/app/_admin/icones";
import { caminhoSeguro } from "@/lib/dominio/destino";
import { FormularioEntrada } from "./formulario";
import { emailConfigurado } from "@/lib/email/enviar";

export const metadata: Metadata = { title: "Entrar" };

/**
 * A porta de entrada apresenta o sistema, não só o formulário.
 *
 * Quem chega pela primeira vez (analista nova, administrador, cliente)
 * precisa entender em uma tela o que existe aqui dentro.
 *
 * O painel da esquerda é navy FIXO (o lockup branco, modo `fixo`), como a
 * sidebar; o da direita segue o tema. No celular o painel vira um cabeçalho
 * curto e a lista de recursos some — ali a pessoa quer entrar, não ler.
 */

const RECURSOS: { icone: NomeDoIcone; titulo: string; texto: string }[] = [
  {
    icone: "controle",
    titulo: "Controle mensal",
    texto: "Uma linha por cliente, com as quatro datas do mês e o passo em que cada um está.",
  },
  {
    icone: "clientes",
    titulo: "Clientes e apólices",
    texto: "Cadastro, apólice lida do PDF, regras do mês e o canal por onde o cliente é avisado.",
  },
  {
    icone: "lista",
    titulo: "Avisos no prazo",
    texto: "Informar até, corte, boleto e vencimento: cada data vira uma mensagem ao cliente.",
  },
  {
    icone: "ajuda",
    titulo: "Portal do cliente",
    texto: "O cliente envia a planilha do mês e encontra seus boletos e documentos num lugar só.",
  },
];

export default async function PaginaEntrar({
  searchParams,
}: {
  searchParams: Promise<{ destino?: string; erro?: string }>;
}) {
  const { destino, erro } = await searchParams;

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* ---------------- Painel da marca ---------------- */}
      <section
        className="relative flex flex-col justify-between overflow-hidden bg-[var(--mx-navy)] px-6 py-8 text-white sm:px-10 lg:px-14 lg:py-12"
        style={{
          // Duas luzes discretas, sky e sage, para o navy não ser um bloco chapado.
          backgroundImage:
            "radial-gradient(60% 50% at 100% 0%, rgba(202,227,247,.16), transparent 70%), " +
            "radial-gradient(50% 45% at 0% 100%, rgba(176,175,148,.18), transparent 70%)",
        }}
      >
        <div>
          <LockupMX altura={24} modo="fixo" titulo="MX Corretora de seguros" />

          <p className="mt-10 font-(family-name:--font-display) text-[11px] font-[800] tracking-[.14em] text-[var(--mx-sage)] uppercase lg:mt-16">
            Saúde, vida e odonto
          </p>
          {/* text-white EXPLICITO: a regra base do h1 em globals.css pinta em
              --heading, que no tema claro e quase preto — e venceria a cor
              herdada do painel. No escuro passava por sorte. */}
          <h1 className="mt-3 max-w-[16ch] font-(family-name:--font-display) text-[30px] leading-[1.08] font-[800] text-balance text-white sm:text-[38px] lg:text-[44px]">
            O mês de cada cliente, da planilha ao boleto.
          </h1>
          <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-[#C9D6E6] sm:text-[16px]">
            As datas de cada apólice, os avisos ao cliente e os documentos do
            mês num lugar só — com o prazo sempre à vista e a equipe decidindo.
          </p>

          <ul className="mt-10 hidden max-w-[52ch] flex-col gap-5 lg:flex">
            {RECURSOS.map((r) => (
              <li key={r.titulo} className="flex gap-4">
                <span
                  aria-hidden="true"
                  className="mt-0.5 inline-grid size-9 shrink-0 place-items-center rounded-[8px] bg-[rgba(202,227,247,.12)] text-[var(--mx-sky)]"
                >
                  <Icone nome={r.icone} tamanho={18} />
                </span>
                <span>
                  <span className="block font-(family-name:--font-display) text-[14.5px] font-[700]">
                    {r.titulo}
                  </span>
                  <span className="mt-0.5 block text-[13.5px] leading-relaxed text-[#A8BCD4]">
                    {r.texto}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-10 text-[12px] text-[#8FA8C4] lg:mt-12">
          Sistema da MX Corretora de Seguros. Os dados aqui são de clientes:
          não compartilhe seu acesso.
        </p>
      </section>

      {/* ---------------- Formulário ---------------- */}
      <section className="flex items-center justify-center bg-bg px-6 py-10 sm:px-10">
        <div className="w-full max-w-[400px]">
          <h2 className="font-(family-name:--font-display) text-[24px] font-[800] leading-tight text-heading">
            Entrar
          </h2>
          <p className="mt-1.5 mb-6 text-[14px] text-muted">
            Equipe da MX e clientes com acesso ao portal. Use o e-mail cadastrado.
          </p>

          {erro === "sessao" ? (
            <div
              role="alert"
              className="mb-5 rounded-[8px] border border-warn bg-warn-soft p-3 text-[13px] text-texto"
            >
              Sua sessão expirou. Entre de novo para continuar.
            </div>
          ) : null}

          {erro === "link" ? (
            <div
              role="alert"
              className="mb-5 rounded-[8px] border border-warn bg-warn-soft p-3 text-[13px] text-texto"
            >
              Esse link já foi usado ou expirou. Peça um novo, ou entre com a
              sua senha.
            </div>
          ) : null}

          {/* Validado AQUI, e nao no formulario: o formulario faz
              `router.replace(destino)`, e o roteador do Next aceita URL
              absoluta — com o valor cru da query, /entrar?destino=https://...
              levava a pessoa para fora do site logo depois de ela digitar a
              senha certa. */}
          {/* Sem provedor de e-mail (E3), "Esqueci a senha" seria um beco sem
              saida: o link e trocado por "peca ao administrador". */}
          <FormularioEntrada destino={caminhoSeguro(destino)} linkPorEmail={emailConfigurado()} />

          <p className="mt-8 text-[12.5px] text-faint">
            Sem acesso? Fale com a MX: a equipe cria o seu acesso e envia a
            senha inicial por e-mail.
          </p>
        </div>
      </section>
    </main>
  );
}

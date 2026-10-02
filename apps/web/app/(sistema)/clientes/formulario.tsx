"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Botao, LinkBotao } from "@/componentes/ui/botao";
import { CaixaDeSelecao, Campo, Selecao } from "@/componentes/ui/campo";
import { Aviso, useAviso } from "@/componentes/ui/aviso";
import { CANAIS, PRODUTOS, ROTULO_PRODUTO, esquemaCliente } from "@/lib/dominio/cliente";
import { ROTULO_CANAL, type Canal } from "@/lib/dominio/mensagem";
import { mascararDocumento, mascararTelefone } from "@/lib/dominio/mascaras";
import { porCampo, validar, type ErroDeCampo } from "@/lib/dominio/validar";
import type { ClienteCompleto, Seguradora } from "@/lib/clientes/consulta";

/**
 * Cadastro do cliente, em quatro blocos: segurado, regras do mês, canal de
 * aviso e observações.
 *
 * "Novo" e "editar" são a MESMA tela: o que muda é o que já vem preenchido e
 * o rótulo do botão. Duas telas divergiriam no dia em que um campo mudasse de
 * regra — e as regras do mês são justamente o que ainda vai mudar.
 *
 * O mesmo esquema zod valida aqui e na rota. Aqui é conveniência, para a
 * pessoa não esperar a ida ao servidor; quem decide é o servidor.
 */

type Valores = Record<string, string>;

function valoresIniciais(cliente?: ClienteCompleto | null): Valores {
  return {
    razaoSocial: cliente?.razaoSocial ?? "",
    nomeFantasia: cliente?.nomeFantasia ?? "",
    documento: cliente ? mascararDocumento(cliente.documento) : "",
    seguradoraId: cliente?.seguradoraId ? String(cliente.seguradoraId) : "",
    produto: cliente?.produto ?? "life",
    observacoes: cliente?.observacoes ?? "",
    informarDia: cliente?.informarDia ? String(cliente.informarDia) : "",
    corteDia: cliente?.corteDia ? String(cliente.corteDia) : "",
    boletoDia: cliente?.boletoDia ? String(cliente.boletoDia) : "",
    vencimentoDia: cliente?.vencimentoDia ? String(cliente.vencimentoDia) : "",
    // `"1"` e nao `true`: o estado do formulario e um mapa de strings, e ele
    // sobe para a rota como esta. O esquema aceita as duas formas.
    acompanhaPagamento: (cliente?.acompanhaPagamento ?? true) ? "1" : "",
    canal: cliente?.canal ?? "whatsapp",
    gestorNome: cliente?.gestorNome ?? "",
    gestorCelular: cliente ? mascararTelefone(cliente.gestorCelular ?? "") : "",
    gestorEmail: cliente?.gestorEmail ?? "",
  };
}

export function FormularioCliente({
  cliente,
  seguradoras,
}: {
  cliente?: ClienteCompleto | null;
  seguradoras: Seguradora[];
}) {
  const router = useRouter();
  const aviso = useAviso();
  const editando = Boolean(cliente);

  const [valores, setValores] = useState<Valores>(() => valoresIniciais(cliente));
  const [erros, setErros] = useState<Record<string, string>>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function definir(campo: string, valor: string) {
    setValores((atual) => ({ ...atual, [campo]: valor }));
    setErros((atual) => {
      if (!atual[campo]) return atual;
      const copia = { ...atual };
      delete copia[campo];
      return copia;
    });
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setFalha(null);

    const analise = validar(esquemaCliente, valores);
    if (!analise.ok) {
      setErros(porCampo(analise.erros));
      const quantos = analise.erros.length;
      setFalha(`${quantos} ${quantos === 1 ? "campo precisa" : "campos precisam"} de atenção.`);
      return;
    }

    setEnviando(true);
    try {
      const resposta = await fetch(editando ? `/api/v1/clientes/${cliente!.id}` : "/api/v1/clientes", {
        method: editando ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(valores),
      });
      const json = await resposta.json().catch(() => null);

      if (!resposta.ok) {
        const lista = json?.error?.fields as ErroDeCampo[] | undefined;
        if (lista?.length) setErros(porCampo(lista));
        else if (json?.error?.field) setErros({ [json.error.field]: json.error.message });
        setFalha(json?.error?.message ?? "Não foi possível salvar o cliente.");
        return;
      }

      aviso.mostrar(editando ? "Cliente salvo." : "Cliente cadastrado.");
      router.push(`/clientes/${json.data.id}`);
      router.refresh();
    } catch {
      setFalha("Não foi possível falar com o servidor.");
    } finally {
      setEnviando(false);
    }
  }

  const semMovimentacao = !valores.informarDia && !valores.corteDia;
  const canal = valores.canal as Canal;

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-6">
      {falha ? (
        <p role="alert" className="rounded-[8px] border border-bad bg-bad-soft px-3 py-2.5 text-[13.5px] text-bad">
          {falha}
        </p>
      ) : null}

      {/* ------------------------------ Segurado ------------------------------ */}
      <section className="flex flex-col gap-4 rounded-[10px] border border-line bg-surface p-4 sm:p-5">
        <h2 className="font-(family-name:--font-display) text-[15px] font-[700] text-heading">Segurado</h2>

        <Campo
          rotulo="Razão social"
          required
          autoComplete="organization"
          value={valores.razaoSocial}
          onChange={(e) => definir("razaoSocial", e.target.value)}
          erro={erros.razaoSocial}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            rotulo="CNPJ"
            required
            placeholder="00.000.000/0000-00"
            inputMode="numeric"
            mascara={mascararDocumento}
            value={valores.documento}
            onChange={(e) => definir("documento", e.target.value)}
            erro={erros.documento}
          />
          <Campo
            rotulo="Nome fantasia"
            value={valores.nomeFantasia}
            onChange={(e) => definir("nomeFantasia", e.target.value)}
            erro={erros.nomeFantasia}
            dica="É como o cliente aparece nas listas e nas mensagens."
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Selecao
            rotulo="Seguradora"
            opcoes={seguradoras.map((s) => ({ valor: s.id, rotulo: s.nome }))}
            vazio="Ainda não definida"
            value={valores.seguradoraId}
            onChange={(e) => definir("seguradoraId", e.target.value)}
            erro={erros.seguradoraId}
          />
          <Selecao
            rotulo="Tipo de seguro"
            required
            vazio={null}
            opcoes={PRODUTOS.map((p) => ({ valor: p, rotulo: ROTULO_PRODUTO[p] }))}
            value={valores.produto}
            onChange={(e) => definir("produto", e.target.value)}
            erro={erros.produto}
          />
        </div>
      </section>

      {/* --------------------------- Regras do mês --------------------------- */}
      <section className="flex flex-col gap-4 rounded-[10px] border border-line bg-surface p-4 sm:p-5">
        <div>
          <h2 className="font-(family-name:--font-display) text-[15px] font-[700] text-heading">Regras do mês</h2>
          <p className="mt-1 max-w-[62ch] text-[13px] leading-relaxed text-muted">
            O dia do mês de cada etapa. Eles se repetem todo mês, e é deles que nascem a linha do Controle e as
            quatro mensagens ao cliente. Dia que não existe no mês vira o último; data menor que a anterior cai no
            mês seguinte.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Campo
            rotulo="Informar até"
            inputMode="numeric"
            maxLength={2}
            placeholder="dia"
            value={valores.informarDia}
            onChange={(e) => definir("informarDia", e.target.value.replace(/\D/g, ""))}
            erro={erros.informarDia}
            dica="Quando cobramos a planilha."
          />
          <Campo
            rotulo="Corte"
            inputMode="numeric"
            maxLength={2}
            placeholder="dia"
            value={valores.corteDia}
            onChange={(e) => definir("corteDia", e.target.value.replace(/\D/g, ""))}
            erro={erros.corteDia}
            dica="Último dia para movimentar."
          />
          <Campo
            rotulo="Emissão do boleto"
            required
            inputMode="numeric"
            maxLength={2}
            placeholder="dia"
            value={valores.boletoDia}
            onChange={(e) => definir("boletoDia", e.target.value.replace(/\D/g, ""))}
            erro={erros.boletoDia}
          />
          <Campo
            rotulo="Vencimento"
            required
            inputMode="numeric"
            maxLength={2}
            placeholder="dia"
            value={valores.vencimentoDia}
            onChange={(e) => definir("vencimentoDia", e.target.value.replace(/\D/g, ""))}
            erro={erros.vencimentoDia}
          />
        </div>

        {semMovimentacao ? (
          <p role="status" className="rounded-[8px] bg-surface-2 px-3 py-2.5 text-[13px] leading-relaxed text-texto">
            Sem informar e sem corte: esta apólice não tem movimentação de vidas. O mês vai começar direto no
            boleto — é o caso de saúde PME, global e transporte.
          </p>
        ) : null}

        <div className="border-t border-line pt-4">
          <CaixaDeSelecao
            rotulo="A MX acompanha o pagamento deste cliente"
            motivo="Desmarque quando a seguradora cobra direto. O mês fecha ao anexar o boleto e o aviso de vencimento não sai."
            checked={valores.acompanhaPagamento === "1"}
            onChange={(e) => definir("acompanhaPagamento", e.target.checked ? "1" : "")}
          />

          {valores.acompanhaPagamento !== "1" ? (
            <p role="status" className="mt-2 rounded-[8px] bg-surface-2 px-3 py-2.5 text-[13px] leading-relaxed text-texto">
              A seguradora cobra direto. O dia de vencimento acima continua guardado, mas o sistema não controla
              essa data nem avisa o cliente sobre ela.
            </p>
          ) : null}
        </div>
      </section>

      {/* --------------------------- Canal de aviso --------------------------- */}
      <section className="flex flex-col gap-4 rounded-[10px] border border-line bg-surface p-4 sm:p-5">
        <div>
          <h2 className="font-(family-name:--font-display) text-[15px] font-[700] text-heading">Canal de aviso</h2>
          <p className="mt-1 max-w-[62ch] text-[13px] leading-relaxed text-muted">
            Por onde o gestor do cliente recebe as mensagens das quatro datas. O e-mail sai sozinho; o WhatsApp
            abre com o texto pronto para a analista enviar.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Selecao
            rotulo="Canal"
            required
            vazio={null}
            opcoes={CANAIS.map((c) => ({ valor: c, rotulo: ROTULO_CANAL[c] }))}
            value={valores.canal}
            onChange={(e) => definir("canal", e.target.value)}
            erro={erros.canal}
          />
          <Campo
            rotulo="Gestor responsável"
            autoComplete="name"
            value={valores.gestorNome}
            onChange={(e) => definir("gestorNome", e.target.value)}
            erro={erros.gestorNome}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            rotulo="Celular (WhatsApp)"
            required={canal !== "email"}
            inputMode="numeric"
            placeholder="(00) 90000-0000"
            mascara={mascararTelefone}
            value={valores.gestorCelular}
            onChange={(e) => definir("gestorCelular", e.target.value)}
            erro={erros.gestorCelular}
          />
          <Campo
            rotulo="E-mail"
            required={canal !== "whatsapp"}
            type="email"
            autoComplete="email"
            placeholder="nome@empresa.com.br"
            value={valores.gestorEmail}
            onChange={(e) => definir("gestorEmail", e.target.value)}
            erro={erros.gestorEmail}
            dica="Também é o login do gestor no portal."
          />
        </div>
      </section>

      {/* ---------------------------- Observações ---------------------------- */}
      <section className="flex flex-col gap-4 rounded-[10px] border border-line bg-surface p-4 sm:p-5">
        <Campo
          rotulo="Observações"
          value={valores.observacoes}
          onChange={(e) => definir("observacoes", e.target.value)}
          erro={erros.observacoes}
          dica="O que a equipe precisa lembrar: portal da seguradora, quem cobrar, particularidades da apólice."
        />
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Botao type="submit" disabled={enviando}>
          {enviando ? "Salvando…" : editando ? "Salvar" : "Cadastrar cliente"}
        </Botao>
        <LinkBotao href={editando ? `/clientes/${cliente!.id}` : "/clientes"} variante="secundario">
          Cancelar
        </LinkBotao>
      </div>

      <Aviso estado={aviso.estado} onFechar={aviso.fechar} />
    </form>
  );
}

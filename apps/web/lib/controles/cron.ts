import "server-only";

import { clienteAdministrador } from "../supabase/administrador";
import { urlBase } from "../ambiente";
import { deModelo, dePasso, paraCanal, paraModelo, paraPasso } from "../dominio/mapear";
import {
  avancoAutomatico,
  competenciaDe,
  mensagemDevida,
  type DatasDoMes,
  type ModeloDeMensagem,
  type Passo,
} from "../dominio/controle";
import { competenciaDeHoje } from "../dominio/hoje";
import { canaisPossiveis, montarEmailDaMensagem, ROTULO_MODELO } from "../dominio/mensagem";
import { nomeCurto } from "../dominio/cliente";
import { enviarEmail } from "../email/enviar";
import { registrarLog } from "../log";
import { abrirCompetencia } from "./servico";
import { primeiroDia } from "./consulta";

/**
 * O trabalho do job da manhã, fora da rota.
 *
 * A rota cuida do segredo e da marca do dia; aqui fica o que o job FAZ, que é
 * o que precisa ser lido quando alguém pergunta por que um cliente não foi
 * avisado.
 *
 * Roda com a chave de administração, que IGNORA a RLS — às 7h não há sessão de
 * ninguém. Em troca, nada aqui recebe entrada de fora: a única coisa que vem
 * do mundo é a data.
 */

type Cliente = ReturnType<typeof clienteAdministrador>;

export type ResumoDoDia = {
  abertos: number;
  avancados: number;
  emailsEnviados: number;
  emailsFalhos: number;
  whatsappsPendentes: number;
  semContato: number;
};

type LinhaDoDia = {
  id: string;
  step: string;
  inform_date: string | null;
  cutoff_date: string | null;
  invoice_date: string;
  due_date: string;
  competence: string;
  legal_name: string;
  trade_name: string | null;
  channel: string;
  manager_name: string | null;
  manager_phone: string | null;
  manager_email: string | null;
  insurer_name: string | null;
  analyst_name: string | null;
  invoice_amount: string | number | null;
  mx_tracks_payment: boolean;
};

/**
 * As competências que o job olha: a deste mês e a do mês passado.
 *
 * O mês passado continua na lista porque o vencimento cai depois do corte e,
 * quando o dia do vencimento é menor que o do boleto, cai no mês seguinte —
 * é exatamente o cliente atrasado que sairia da varredura se ela olhasse só
 * o mês corrente.
 */
function competenciasEmJogo(hoje: string): string[] {
  const atual = competenciaDeHoje(new Date(`${hoje}T12:00:00Z`));
  const [ano, mes] = atual.split("-").map(Number) as [number, number];
  const anterior = mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, "0")}`;
  return [anterior, atual];
}

export async function rodarODia(hoje: string, supabase: Cliente): Promise<ResumoDoDia> {
  const resumo: ResumoDoDia = {
    abertos: 0,
    avancados: 0,
    emailsEnviados: 0,
    emailsFalhos: 0,
    whatsappsPendentes: 0,
    semContato: 0,
  };

  const competencias = competenciasEmJogo(hoje);
  const atual = competencias[competencias.length - 1] as string;

  // 1. Abre o mês. Idempotente por `unique (client_id, competence)`, então o
  //    cliente cadastrado ontem entra hoje sem ninguém pedir.
  const abertura = await abrirCompetencia(atual, supabase);
  if (abertura.ok) resumo.abertos = abertura.dados.abertos;

  const { data, error } = await supabase
    .from("v_control_board")
    .select(
      "id, step, inform_date, cutoff_date, invoice_date, due_date, competence, legal_name, trade_name, channel, manager_name, manager_phone, manager_email, insurer_name, analyst_name, invoice_amount, mx_tracks_payment",
    )
    .in(
      "competence",
      competencias.map((c) => primeiroDia(c)),
    )
    .neq("step", "done");

  if (error) {
    registrarLog("erro", "cron.mensal.leitura", { codigo: error.code });
    return resumo;
  }

  const linhas = (data ?? []) as unknown as LinhaDoDia[];
  if (!linhas.length) return resumo;

  // Os modelos, uma vez só: são cinco linhas lidas para dezenas de mensagens.
  const { data: modelosCrus } = await supabase
    .from("message_templates")
    .select("kind, subject, body");

  const modelos = new Map(
    ((modelosCrus ?? []) as { kind: string; subject: string; body: string }[]).map((m) => [
      paraModelo(m.kind),
      { assunto: m.subject, corpo: m.body },
    ]),
  );

  // O que já saiu, para não sair de novo. Uma consulta para todas as linhas:
  // uma por linha seriam centenas de idas ao banco no primeiro mês cheio.
  const { data: jaEnviadas } = await supabase
    .from("messages")
    .select("control_id, kind")
    .in(
      "control_id",
      linhas.map((l) => l.id),
    );

  const jaSaiu = new Set(
    ((jaEnviadas ?? []) as { control_id: string; kind: string }[]).map((m) => `${m.control_id}:${m.kind}`),
  );

  // O link do portal vai DENTRO da mensagem do cliente: em produção precisa
  // ser o endereço público, e não o localhost do padrão.
  const portal = urlBase();

  for (const linha of linhas) {
    const datas: DatasDoMes = {
      informar: linha.inform_date,
      corte: linha.cutoff_date,
      boleto: linha.invoice_date,
      vencimento: linha.due_date,
    };

    // 2. O avanço que o calendário faz sozinho.
    const passoAtual = paraPasso(linha.step);
    const passo = avancoAutomatico(passoAtual, datas, hoje, linha.mx_tracks_payment);

    if (passo !== passoAtual) {
      const mudou = await avancarPasso(supabase, linha.id, passoAtual, passo);
      if (mudou) resumo.avancados += 1;
      // Passo que não avançou não pode disparar a mensagem do passo novo: o
      // cliente receberia o aviso de vencimento com o Controle ainda em
      // boleto, e ninguém conseguiria explicar a divergência.
      else continue;
    }

    // 3. A mensagem cujo dia chegou.
    const modelo = mensagemDevida(passo, datas, hoje, linha.mx_tracks_payment);
    if (!modelo) continue;
    if (jaSaiu.has(`${linha.id}:${deModelo(modelo)}`)) continue;

    await enviarDoDia(supabase, linha, datas, modelo, modelos, portal, resumo);
  }

  return resumo;
}

/**
 * Muda o passo e registra o evento, com origem `system`.
 *
 * Mesma regra da escrita da analista: se o evento falhar, o passo VOLTA. Um
 * mês que andou sem registro é pior que um mês que não andou.
 */
async function avancarPasso(
  supabase: Cliente,
  id: string,
  de: Passo,
  para: Passo,
): Promise<boolean> {
  const { error } = await supabase.from("monthly_controls").update({ step: dePasso(para) }).eq("id", id);
  if (error) return false;

  const { error: erroEvento } = await supabase.from("control_events").insert({
    control_id: id,
    type: "step_changed",
    origin: "system",
    from_step: dePasso(de),
    to_step: dePasso(para),
    // O motivo importa na linha do tempo: "fechou porque a seguradora cobra
    // direto" e "avançou porque a data chegou" são coisas diferentes, e quem
    // for conferir o mês meses depois não tem como adivinhar qual foi.
    note:
      para === "concluida"
        ? "Mês fechado: a seguradora cobra direto."
        : "Avanço automático pela data.",
  });

  if (erroEvento) {
    await supabase.from("monthly_controls").update({ step: dePasso(de) }).eq("id", id);
    return false;
  }

  return true;
}

/**
 * Manda a mensagem do dia — por e-mail, ou deixa o WhatsApp pendente.
 *
 * O WhatsApp NÃO sai daqui. Ele é um link `wa.me` que a analista abre com um
 * clique, e prometer entrega que ninguém pode verificar é pior que não
 * prometer nada. O job registra a mensagem como `pendente`, e ela aparece na
 * fila da analista.
 *
 * Cliente com canal `ambos` recebe o e-mail E ganha o WhatsApp pendente: os
 * dois foram pedidos no cadastro.
 */
type Modelos = Map<ModeloDeMensagem, { assunto: string; corpo: string }>;

async function enviarDoDia(
  supabase: Cliente,
  linha: LinhaDoDia,
  datas: DatasDoMes,
  modelo: ModeloDeMensagem,
  modelos: Modelos,
  portal: string,
  resumo: ResumoDoDia,
): Promise<void> {
  // Modelo ausente é seed incompleto. Sair calado é melhor que mandar uma
  // mensagem vazia para o gestor do cliente; a contagem do dia denuncia.
  const salvo = modelos.get(modelo);
  if (!salvo) return;

  const cliente = nomeCurto({ razaoSocial: linha.legal_name, nomeFantasia: linha.trade_name });
  const canal = paraCanal(linha.channel);
  const canais = canaisPossiveis(canal, { celular: linha.manager_phone, email: linha.manager_email });

  if (!canais.whatsapp && !canais.email) {
    // Canal pedido no cadastro, contato ausente: é erro de cadastro, e quem
    // resolve é a analista. O log conta quantos são sem dizer quem.
    resumo.semContato += 1;
    return;
  }

  // Um contexto só para o corpo e para o assunto: com dois, um `{{data}}` no
  // assunto renderizaria vazio enquanto o mesmo `{{data}}` no corpo aparecia.
  const contexto = {
    cliente,
    gestor: linha.manager_name,
    competencia: competenciaDe(linha.competence),
    // A data "do momento" é a do passo que disparou a mensagem.
    data: modelo === "corte" ? datas.corte : modelo === "vencimento" ? datas.vencimento : datas.informar,
    dataCorte: datas.corte,
    dataBoleto: datas.boleto,
    dataVencimento: datas.vencimento,
    valorDoBoleto: linha.invoice_amount === null ? null : Number(linha.invoice_amount),
    link: `${portal}/portal`,
    seguradora: linha.insurer_name,
    analista: linha.analyst_name,
  };

  const email = montarEmailDaMensagem(salvo, contexto);
  // O WhatsApp leva o mesmo texto, sem o embrulho de HTML.
  const texto = email.texto;

  if (canais.email && linha.manager_email) {
    const envio = await enviarEmail({
      para: [linha.manager_email],
      assunto: email.assunto,
      texto,
      html: email.html,
    });

    if (envio.ok) resumo.emailsEnviados += 1;
    else resumo.emailsFalhos += 1;

    await gravar(supabase, linha.id, modelo, "email", linha.manager_email, texto, envio.ok ? null : envio.codigo);
  }

  if (canais.whatsapp && linha.manager_phone) {
    await gravar(supabase, linha.id, modelo, "whatsapp", linha.manager_phone, texto, null, "pending");
    resumo.whatsappsPendentes += 1;
  }
}

/**
 * Registra a mensagem e aponta a linha do Controle para ela.
 *
 * Não reusa `registrarMensagem` do serviço: lá o autor é a analista logada, e
 * aqui não há ninguém. `sent_by` fica nulo de propósito — é o que diz, na
 * linha do tempo, que foi o sistema.
 */
async function gravar(
  supabase: Cliente,
  controleId: string,
  modelo: ModeloDeMensagem,
  canal: "email" | "whatsapp",
  destino: string,
  corpo: string,
  falhou: string | null,
  estado: "sent" | "pending" = "sent",
): Promise<void> {
  const status = falhou ? "failed" : estado;

  const { data, error } = await supabase
    .from("messages")
    .insert({
      control_id: controleId,
      kind: deModelo(modelo),
      channel: canal,
      to_address: destino,
      body: corpo,
      status,
      sent_by: null,
      sent_at: status === "sent" ? new Date().toISOString() : null,
      error: falhou,
    })
    .select("id")
    .single();

  if (error || !data) return;

  // Só o que CHEGOU vira "última mensagem" na tela: o WhatsApp pendente ainda
  // depende do clique da analista, e a falha não chegou a lugar nenhum.
  if (status !== "sent") return;

  const id = (data as { id: number }).id;
  await supabase.from("monthly_controls").update({ last_message_id: id }).eq("id", controleId);
  await supabase.from("control_events").insert({
    control_id: controleId,
    type: "message",
    origin: "system",
    note: `${ROTULO_MODELO[modelo]} enviada por ${canal === "email" ? "e-mail" : "WhatsApp"}.`,
    payload: { kind: deModelo(modelo), channel: canal },
  });
}

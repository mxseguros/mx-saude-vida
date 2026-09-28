/**
 * "hoje às 17:42", "ontem às 17:42", "em 15/09 às 17:42" (17/09).
 *
 * Para o aviso de rascunho recuperado: a pessoa precisa saber DE QUANDO e o
 * que voltou preenchido, e "17:42" sozinho nao diz se foi ha dez minutos ou
 * ontem. Puro: recebe o "agora" para ter teste. Fuso de Sao Paulo, como
 * todo o resto do sistema.
 */

const FUSO = "America/Sao_Paulo";

function diaEm(data: Date): string {
  return data.toLocaleDateString("en-CA", { timeZone: FUSO });
}

function horaEm(data: Date): string {
  return data.toLocaleTimeString("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });
}

export function descreverQuando(iso: string, agora: Date = new Date()): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";

  const hora = horaEm(data);
  const dia = diaEm(data);
  const hoje = diaEm(agora);
  if (dia === hoje) return `hoje às ${hora}`;

  const ontem = diaEm(new Date(agora.getTime() - 24 * 60 * 60 * 1000));
  if (dia === ontem) return `ontem às ${hora}`;

  const [, mes, diaDoMes] = dia.split("-");
  return `em ${diaDoMes}/${mes} às ${hora}`;
}

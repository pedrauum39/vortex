// A virada de meia-noite do T6/T1 mora aqui. O turno datado em D vai das
// 21:00 de D às 05:00 de D+1 — então às 02:00 o turno "de hoje" ainda é o de
// ontem. É o caso que erra em silêncio se ficar espalhado pelas telas.

import { brtParaUtc, dataBRT, relogioBRT, somarDias } from './tempo';
import { HORARIOS, type Turno } from './tipos';

const paraHoraMinuto = (hhmm: string) => hhmm.split(':').map(Number);

/** Data do shift ao qual o instante pertence, para um turno. */
export function dataDoTurnoAtual(turno: Turno, agora: Date = new Date()): string {
  const hoje = dataBRT(agora);
  const [horaInicio] = paraHoraMinuto(HORARIOS[turno].inicio);
  const [horaFim] = paraHoraMinuto(HORARIOS[turno].fim);

  const cruzaMeiaNoite = horaFim <= horaInicio;
  if (!cruzaMeiaNoite) return hoje;

  // Antes do fim do turno noturno, ainda estamos no turno que começou ontem.
  return relogioBRT(agora).hora < horaFim ? somarDias(hoje, -1) : hoje;
}

/** Quanto antes do turno o clock in fica liberado. */
export const MINUTOS_DE_ANTECEDENCIA = 15;

/**
 * O clock in abre 15 minutos antes e não fecha mais — só a data do turno
 * (checada em outro lugar) limita até quando dá pra abrir. Sem isso, um rep
 * que esquece de bater ponto durante o turno nunca mais conseguiria registrar
 * aquele turno.
 */
export function podeIniciar(turno: Turno, data: string, agora: Date = new Date()): boolean {
  const { inicio } = janelaDoTurno(turno, data);
  const abre = inicio.getTime() - MINUTOS_DE_ANTECEDENCIA * 60_000;

  return agora.getTime() >= abre;
}

/**
 * Horas contadas do turno, sempre dentro da janela oficial: entrar adiantado
 * não começa a contar antes da hora, e sair atrasado não conta depois do fim.
 * Turno em andamento (sem saída) conta até agora.
 *
 * Turno FECHADO sem marcar "saiu antes" sempre paga a janela inteira (8h),
 * não importa a que horas bateu saída — só quem marcou a caixa tem a hora
 * de fato reduzida pela saída antecipada.
 */
export function horasDoTurno(
  turno: Turno,
  data: string,
  entrada: Date,
  saida: Date | null,
  saiuAntes: boolean,
  agora: Date = new Date(),
): number {
  const { inicio, fim } = janelaDoTurno(turno, data);

  if (saida && !saiuAntes) {
    return Math.max(0, Math.round(((fim.getTime() - inicio.getTime()) / 3_600_000) * 100) / 100);
  }

  const de = Math.max(entrada.getTime(), inicio.getTime());
  const ate = Math.min((saida ?? agora).getTime(), fim.getTime());

  return Math.max(0, Math.round(((ate - de) / 3_600_000) * 100) / 100);
}

/** Início e fim previstos de um turno, como instantes UTC. */
export function janelaDoTurno(turno: Turno, data: string): { inicio: Date; fim: Date } {
  const [ano, mes, dia] = data.split('-').map(Number);
  const [horaInicio, minutoInicio] = paraHoraMinuto(HORARIOS[turno].inicio);
  const [horaFim, minutoFim] = paraHoraMinuto(HORARIOS[turno].fim);

  const inicio = brtParaUtc(ano, mes, dia, horaInicio, minutoInicio);
  const diaDoFim = horaFim <= horaInicio ? somarDias(data, 1) : data;
  const [anoFim, mesFim, diaFim] = diaDoFim.split('-').map(Number);

  return { inicio, fim: brtParaUtc(anoFim, mesFim, diaFim, horaFim, minutoFim) };
}

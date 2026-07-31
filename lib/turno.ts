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

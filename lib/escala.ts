// Gerador da escala 3x1. Função pura, sem I/O.
//
// A escala é função apenas da DATA — `fase = (data − âncora) mod 4`. Não existe
// estado acumulado entre dias, então uma alteração num dia é matematicamente
// incapaz de deslocar o dia seguinte. É isso que garante que edição manual não
// propaga.

import { TURNOS, type Bloco, type Funcao, type Origem, type Papel, type Turno } from './tipos';

export type SlotEscala = {
  data: string; // 'YYYY-MM-DD'
  turno: Turno;
  bloco: Bloco;
  funcao: Funcao;
  papel: Papel;
  origem: Origem;
};

/** Um override do admin: quem ocupa um slot específico num dia específico. */
export type Override = {
  data: string;
  turno: Turno;
  bloco: Bloco;
  funcao: Funcao;
  papel: Papel;
};

/** Dia em que o ciclo de 4 fases começa. Ver project.md. */
export const ANCORA = '2026-08-10';

/** Fase em que cada papel folga, por turno. O tertius folga na fase 2 nos três. */
const FOLGA: Record<Turno, Record<Papel, number>> = {
  T2T3: { A: 1, B: 0, C: 2 },
  T4T5: { A: 0, B: 3, C: 2 },
  T6T1: { A: 3, B: 0, C: 2 },
};

// Aritmética de datas em dias inteiros de UTC: 'YYYY-MM-DD' entra e sai sem
// passar por fuso nenhum.
function emDias(data: string): number {
  const [ano, mes, dia] = data.split('-').map(Number);
  return Date.UTC(ano, mes - 1, dia) / 86_400_000;
}

function emData(dias: number): string {
  return new Date(dias * 86_400_000).toISOString().slice(0, 10);
}

export function fase(data: string): number {
  return (((emDias(data) - emDias(ANCORA)) % 4) + 4) % 4;
}

export function gerarEscala(dataInicio: string, dataFim: string): SlotEscala[] {
  const slots: SlotEscala[] = [];

  for (let dia = emDias(dataInicio); dia <= emDias(dataFim); dia++) {
    const data = emData(dia);
    const f = fase(data);

    for (const turno of TURNOS) {
      const folga = FOLGA[turno];
      const por = (bloco: Bloco, funcao: Funcao, papel: Papel) =>
        slots.push({ data, turno, bloco, funcao, papel, origem: 'gerado' });

      if (f === folga.A) {
        por('I', 'regular', 'B');
        por('II', 'regular', 'C');
      } else if (f === folga.B) {
        por('I', 'regular', 'A');
        por('II', 'regular', 'C');
      } else if (f === folga.C) {
        por('I', 'regular', 'A');
        por('II', 'regular', 'B');
      } else {
        // Ninguém folga: o tertius vai para o campo Assistant.
        por('I', 'regular', 'A');
        por('I', 'assist', 'C');
        por('II', 'regular', 'B');
      }
    }
  }

  return slots;
}

const chave = (s: { data: string; turno: Turno; bloco: Bloco; funcao: Funcao }) =>
  `${s.data}|${s.turno}|${s.bloco}|${s.funcao}`;

/** O override vence a linha gerada do mesmo slot. O gerador nunca o sobrescreve. */
export function mesclarOverrides(gerados: SlotEscala[], overrides: Override[]): SlotEscala[] {
  const porSlot = new Map(overrides.map((o) => [chave(o), o]));
  const usados = new Set<string>();

  const mesclados = gerados.map((slot) => {
    const override = porSlot.get(chave(slot));
    if (!override) return slot;
    usados.add(chave(slot));
    return { ...slot, papel: override.papel, origem: 'manual' as const };
  });

  // Overrides em slots que a escala gerada não tem — o admin escalando um
  // Assistant num dia sem, por exemplo.
  const novos = overrides
    .filter((o) => !usados.has(chave(o)))
    .map((o): SlotEscala => ({ ...o, origem: 'manual' }));

  return [...mesclados, ...novos];
}

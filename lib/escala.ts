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

/** Primeiro dia com o Time 3 (Vortex III) na escala. Antes disso, só I e II. */
export const INICIO_TIME3 = '2026-10-14';
/** No dia do início, o Time 3 entra a partir deste turno (inclusive). */
const PRIMEIRO_TURNO_TIME3: Turno = 'T4T5';

/** O Time 3 já existe neste turno? */
export function time3Ativo(data: string, turno: Turno): boolean {
  if (data !== INICIO_TIME3) return data > INICIO_TIME3;
  return TURNOS.indexOf(turno) >= TURNOS.indexOf(PRIMEIRO_TURNO_TIME3);
}

/**
 * Antes do Time 3: fase em que cada papel folga, por turno. O tertius (C)
 * folga na fase 2 nos três.
 */
const FOLGA_DOIS_TIMES: Record<Turno, { A: number; B: number; C: number }> = {
  T2T3: { A: 1, B: 0, C: 2 },
  T4T5: { A: 0, B: 3, C: 2 },
  T6T1: { A: 3, B: 0, C: 2 },
};

/**
 * Com o Time 3: 4 reps por turno pra 3 vagas (Vortex I, II e III). Cada um
 * folga numa fase diferente, então todo dia exatamente um folga e não sobra
 * ninguém pra Assistant.
 *
 * `III` é quem fica no Vortex III e sobe pro II na folga de A ou B; `cobre` é
 * o tertius que entra no Vortex III na folga de qualquer titular. No T2/T3 o
 * Time 3 ainda não tem secundus, então a Leticia (E) fica no III e o Oliver
 * (C) cobre.
 */
const TRES_TIMES: Record<
  Turno,
  { folgaA: number; folgaB: number; III: Papel; folgaIII: number; cobre: Papel; folgaCobre: number }
> = {
  T2T3: { folgaA: 1, folgaB: 0, III: 'E', folgaIII: 3, cobre: 'C', folgaCobre: 2 },
  T4T5: { folgaA: 0, folgaB: 3, III: 'D', folgaIII: 2, cobre: 'C', folgaCobre: 1 },
  T6T1: { folgaA: 3, folgaB: 0, III: 'D', folgaIII: 2, cobre: 'E', folgaCobre: 1 },
};

/**
 * T2/T3 a partir de 16/10/2026, enquanto o Time 2 não tem secundus nesse
 * turno: Léo (B) é o titular do Vortex I, Oliver (C) fica no II e Leticia (E)
 * no III — ela nunca vai pro II. Carol (A, Adept Primaris do Time 3) completa
 * o time que sobrar. Continua 3x1: cada um folga numa fase, e é a fase que
 * decide quem está onde.
 */
export const INICIO_T2T3_SEM_SECUNDUS = '2026-10-16';
const T2T3_SEM_SECUNDUS: Record<number, Record<Bloco, Papel>> = {
  0: { I: 'A', II: 'C', III: 'E' }, // folga do Léo: Carol sobe pro I
  1: { I: 'B', II: 'C', III: 'E' }, // folga da Carol
  2: { I: 'B', II: 'A', III: 'E' }, // folga do Oliver: Carol no II
  3: { I: 'B', II: 'C', III: 'A' }, // folga da Leticia: Carol no III
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
      const por = (bloco: Bloco, funcao: Funcao, papel: Papel) =>
        slots.push({ data, turno, bloco, funcao, papel, origem: 'gerado' });

      if (!time3Ativo(data, turno)) {
        const folga = FOLGA_DOIS_TIMES[turno];
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
        continue;
      }

      if (turno === 'T2T3' && data >= INICIO_T2T3_SEM_SECUNDUS) {
        const dia = T2T3_SEM_SECUNDUS[f];
        por('I', 'regular', dia.I);
        por('II', 'regular', dia.II);
        por('III', 'regular', dia.III);
        continue;
      }

      // Três times. Na folga de um titular, quem está embaixo sobe um time
      // (o do II vai pro I, o do III vai pro II) e o tertius entra no III.
      const t = TRES_TIMES[turno];
      if (f === t.folgaA) {
        por('I', 'regular', 'B');
        por('II', 'regular', t.III);
        por('III', 'regular', t.cobre);
      } else if (f === t.folgaB) {
        por('I', 'regular', 'A');
        por('II', 'regular', t.III);
        por('III', 'regular', t.cobre);
      } else if (f === t.folgaIII) {
        por('I', 'regular', 'A');
        por('II', 'regular', 'B');
        por('III', 'regular', t.cobre);
      } else {
        // Folga do tertius: os três titulares.
        por('I', 'regular', 'A');
        por('II', 'regular', 'B');
        por('III', 'regular', t.III);
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

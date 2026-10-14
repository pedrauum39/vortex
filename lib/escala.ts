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
 * Com o Time 3: A, B e D são os titulares do Vortex I, II e III, cada um com
 * a sua fase de folga; C e E são os dois tertius do turno e folgam juntos
 * (`tertius`), na fase que sobra.
 *
 * No T4/T5 e no T6/T1, quem era tertius (Carlos/Diogo) virou o titular D,
 * mantendo a folga da fase 2 — os tertius passaram pra fase 1.
 */
const FOLGA_TRES_TIMES: Record<Turno, { A: number; B: number; D: number; tertius: number }> = {
  T2T3: { A: 1, B: 0, D: 3, tertius: 2 },
  T4T5: { A: 0, B: 3, D: 2, tertius: 1 },
  T6T1: { A: 3, B: 0, D: 2, tertius: 1 },
};

/** A partir daqui, os dois tertius revezam a cada ciclo quem cobre e quem fica de Assistant. */
export const INICIO_ALTERNANCIA = '2026-10-15';

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

/** Número do ciclo de 4 dias desde a âncora. */
function ciclo(data: string): number {
  return Math.floor((emDias(data) - emDias(ANCORA)) / 4);
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

      // Três times. Na folga de um titular, quem está embaixo sobe um time
      // (o do II vai pro I, o do III vai pro II) e o tertius entra sempre no
      // Vortex III. Cada ciclo tem 3 folgas de titular pra cobrir e 3
      // Assistants sobrando, divididos entre os 2 tertius: um cobre as folgas
      // de A e B (2 solos) e fica de Assistant na do D; o outro faz o
      // contrário (1 solo, 2 Assistants). A cada ciclo eles trocam, então os
      // dois fazem o mesmo número de solos.
      const folga = FOLGA_TRES_TIMES[turno];
      const troca = data >= INICIO_ALTERNANCIA && ciclo(data) % 2 === 1;
      const x: Papel = troca ? 'E' : 'C';
      const y: Papel = troca ? 'C' : 'E';

      if (f === folga.A) {
        por('I', 'regular', 'B');
        por('I', 'assist', y);
        por('II', 'regular', 'D');
        por('III', 'regular', x);
      } else if (f === folga.B) {
        por('I', 'regular', 'A');
        por('I', 'assist', y);
        por('II', 'regular', 'D');
        por('III', 'regular', x);
      } else if (f === folga.D) {
        por('I', 'regular', 'A');
        por('I', 'assist', x);
        por('II', 'regular', 'B');
        por('III', 'regular', y);
      } else {
        // Folga dos dois tertius: os três titulares, sem Assistant.
        por('I', 'regular', 'A');
        por('II', 'regular', 'B');
        por('III', 'regular', 'D');
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

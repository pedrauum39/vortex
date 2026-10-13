import { describe, expect, test } from 'vitest';
import { INICIO_TIME3, fase, gerarEscala, mesclarOverrides, type SlotEscala } from './escala';
import type { Papel, Turno } from './tipos';

// Papéis por turno, conforme a tabela de project.md.
const NOMES: Record<Turno, Record<Papel, string>> = {
  T2T3: { A: 'Carolinne P.', B: 'Léo Grimaldi', C: 'Oliver Melo', D: 'Secundus 3 T2T3', E: 'Tertius 2 T2T3' },
  T4T5: { A: 'Gabriela Storini', B: 'Ignacio Canelo', C: 'Carlos de Lucca', D: 'Secundus 3 T4T5', E: 'Tertius 2 T4T5' },
  T6T1: { A: 'Pedro Ribeiro', B: 'Natasha Tem Tem', C: 'Diogo Ciesielski', D: 'Secundus 3 T6T1', E: 'Tertius 2 T6T1' },
};

type Celulas = { I: string; assist: string | null; II: string };

/**
 * A semana de 10/08 a 16/08/2026 exatamente como está na aba `1008 - 1608` de
 * `schedule by claude.xlsx` — a semana que foi conferida à mão e serve de
 * referência. Bloco de cima = linhas 5/6/7, bloco de baixo = linhas 12/13/14.
 */
const SEMANA_REFERENCIA: Record<string, Record<Turno, Celulas>> = {
  '2026-08-10': {
    T2T3: { I: 'Carolinne P.', assist: null, II: 'Oliver Melo' },
    T4T5: { I: 'Ignacio Canelo', assist: null, II: 'Carlos de Lucca' },
    T6T1: { I: 'Pedro Ribeiro', assist: null, II: 'Diogo Ciesielski' },
  },
  '2026-08-11': {
    T2T3: { I: 'Léo Grimaldi', assist: null, II: 'Oliver Melo' },
    T4T5: { I: 'Gabriela Storini', assist: 'Carlos de Lucca', II: 'Ignacio Canelo' },
    T6T1: { I: 'Pedro Ribeiro', assist: 'Diogo Ciesielski', II: 'Natasha Tem Tem' },
  },
  '2026-08-12': {
    T2T3: { I: 'Carolinne P.', assist: null, II: 'Léo Grimaldi' },
    T4T5: { I: 'Gabriela Storini', assist: null, II: 'Ignacio Canelo' },
    T6T1: { I: 'Pedro Ribeiro', assist: null, II: 'Natasha Tem Tem' },
  },
  '2026-08-13': {
    T2T3: { I: 'Carolinne P.', assist: 'Oliver Melo', II: 'Léo Grimaldi' },
    T4T5: { I: 'Gabriela Storini', assist: null, II: 'Carlos de Lucca' },
    T6T1: { I: 'Natasha Tem Tem', assist: null, II: 'Diogo Ciesielski' },
  },
  '2026-08-14': {
    T2T3: { I: 'Carolinne P.', assist: null, II: 'Oliver Melo' },
    T4T5: { I: 'Ignacio Canelo', assist: null, II: 'Carlos de Lucca' },
    T6T1: { I: 'Pedro Ribeiro', assist: null, II: 'Diogo Ciesielski' },
  },
  '2026-08-15': {
    T2T3: { I: 'Léo Grimaldi', assist: null, II: 'Oliver Melo' },
    T4T5: { I: 'Gabriela Storini', assist: 'Carlos de Lucca', II: 'Ignacio Canelo' },
    T6T1: { I: 'Pedro Ribeiro', assist: 'Diogo Ciesielski', II: 'Natasha Tem Tem' },
  },
  '2026-08-16': {
    T2T3: { I: 'Carolinne P.', assist: null, II: 'Léo Grimaldi' },
    T4T5: { I: 'Gabriela Storini', assist: null, II: 'Ignacio Canelo' },
    T6T1: { I: 'Pedro Ribeiro', assist: null, II: 'Natasha Tem Tem' },
  },
};

/** Remonta a grade da planilha a partir dos slots gerados. */
function comoGrade(slots: SlotEscala[]): Record<string, Record<Turno, Celulas>> {
  const grade: Record<string, Record<Turno, Celulas>> = {};

  for (const slot of slots) {
    const dia = (grade[slot.data] ??= {} as Record<Turno, Celulas>);
    const celulas = (dia[slot.turno] ??= { I: '', assist: null, II: '' });
    const nome = NOMES[slot.turno][slot.papel];

    if (slot.funcao === 'assist') celulas.assist = nome;
    else if (slot.bloco === 'I') celulas.I = nome;
    else celulas.II = nome;
  }

  return grade;
}

describe('gerarEscala', () => {
  test('reproduz a semana 10/08–16/08/2026 célula a célula', () => {
    expect(comoGrade(gerarEscala('2026-08-10', '2026-08-16'))).toEqual(SEMANA_REFERENCIA);
  });

  test('mantém o padrão WWW. de cada rep por 8 semanas seguidas', () => {
    const slots = gerarEscala('2026-08-10', '2026-10-04'); // 56 dias
    const dias = [...new Set(slots.map((s) => s.data))].sort();

    for (const turno of ['T2T3', 'T4T5', 'T6T1'] as Turno[]) {
      for (const papel of ['A', 'B', 'C'] as Papel[]) {
        const padrao = dias
          .map((dia) =>
            slots.some((s) => s.data === dia && s.turno === turno && s.papel === papel)
              ? 'W'
              : '.',
          )
          .join('');

        expect(`${turno}/${papel}: ${padrao}`).not.toMatch(/WWWW/);
        expect(`${turno}/${papel}: ${padrao}`).not.toMatch(/\.\./);
      }
    }
  });

  test('não põe a mesma pessoa nos dois blocos no mesmo dia', () => {
    for (const slot of gerarEscala('2026-08-10', '2026-10-04')) {
      const mesmoDia = gerarEscala(slot.data, slot.data).filter(
        (s) => s.turno === slot.turno && s.papel === slot.papel,
      );
      expect(mesmoDia).toHaveLength(1);
    }
  });

  test('só o tertius ocupa o campo Assistant', () => {
    for (const slot of gerarEscala('2026-08-10', '2026-10-04')) {
      if (slot.funcao === 'assist') expect(slot.papel).toBe('C');
    }
  });
});

describe('Time 3', () => {
  const de = INICIO_TIME3;
  const ate = '2026-12-13'; // 8 semanas
  const semTime3 = (slots: SlotEscala[]) => slots.filter((s) => s.papel !== 'D' && s.papel !== 'E');

  test('não existe antes do INICIO_TIME3', () => {
    const antes = gerarEscala('2026-08-10', '2026-10-18');
    expect(antes.some((s) => s.bloco === 'III' || s.papel === 'D' || s.papel === 'E')).toBe(false);
  });

  test('não mexe em nenhum slot de A, B e C', () => {
    // A regra de I/II como era antes do Time 3, congelada aqui.
    const FOLGA_ANTIGA = {
      T2T3: { A: 1, B: 0, C: 2 },
      T4T5: { A: 0, B: 3, C: 2 },
      T6T1: { A: 3, B: 0, C: 2 },
    } as const;
    const esperado: string[] = [];
    for (const data of [...new Set(gerarEscala(de, ate).map((s) => s.data))]) {
      const f = fase(data);
      for (const turno of ['T2T3', 'T4T5', 'T6T1'] as Turno[]) {
        const fo = FOLGA_ANTIGA[turno];
        const por = (bloco: string, funcao: string, papel: string) =>
          esperado.push(`${data}|${turno}|${bloco}|${funcao}|${papel}`);
        if (f === fo.A) {
          por('I', 'regular', 'B');
          por('II', 'regular', 'C');
        } else if (f === fo.B) {
          por('I', 'regular', 'A');
          por('II', 'regular', 'C');
        } else if (f === fo.C) {
          por('I', 'regular', 'A');
          por('II', 'regular', 'B');
        } else {
          por('I', 'regular', 'A');
          por('I', 'assist', 'C');
          por('II', 'regular', 'B');
        }
      }
    }
    const obtido = semTime3(gerarEscala(de, ate)).map(
      (s) => `${s.data}|${s.turno}|${s.bloco}|${s.funcao}|${s.papel}`,
    );
    expect(obtido).toEqual(esperado);
  });

  test('Vortex III tem exatamente um regular todo dia, em todo turno', () => {
    const slots = gerarEscala(de, ate);
    const dias = [...new Set(slots.map((s) => s.data))];
    for (const dia of dias) {
      for (const turno of ['T2T3', 'T4T5', 'T6T1'] as Turno[]) {
        const doIII = slots.filter((s) => s.data === dia && s.turno === turno && s.bloco === 'III');
        expect(doIII).toHaveLength(1);
        expect(doIII[0].funcao).toBe('regular');
      }
    }
  });

  test('D e E ficam em WWW. e nunca em dois lugares no mesmo dia', () => {
    const slots = gerarEscala(de, ate);
    const dias = [...new Set(slots.map((s) => s.data))].sort();
    for (const turno of ['T2T3', 'T4T5', 'T6T1'] as Turno[]) {
      for (const papel of ['D', 'E'] as Papel[]) {
        const padrao = dias
          .map((dia) => {
            const n = slots.filter((s) => s.data === dia && s.turno === turno && s.papel === papel).length;
            expect(n).toBeLessThanOrEqual(1);
            return n ? 'W' : '.';
          })
          .join('');
        expect(padrao).toMatch(/^(WWW\.|WW\.W|W\.WW|\.WWW)+$/);
      }
    }
  });

  test('Assistant continua só com tertius (C ou E) e um por slot', () => {
    const slots = gerarEscala(de, ate);
    for (const s of slots.filter((s) => s.funcao === 'assist')) {
      expect(['C', 'E']).toContain(s.papel);
      expect(s.bloco).toBe('I');
    }
    const chaves = slots.map((s) => `${s.data}|${s.turno}|${s.bloco}|${s.funcao}`);
    expect(new Set(chaves).size).toBe(chaves.length);
  });
});

describe('mesclarOverrides', () => {
  test('override num dia não altera nenhum dia posterior', () => {
    const antes = gerarEscala('2026-08-10', '2026-08-23');

    // Admin cobre uma falta: no dia 12 o tertius do T2/T3 assume o bloco de cima.
    const depois = mesclarOverrides(antes, [
      { data: '2026-08-12', turno: 'T2T3', bloco: 'I', funcao: 'regular', papel: 'C' },
    ]);

    const posteriores = (slots: SlotEscala[]) => slots.filter((s) => s.data > '2026-08-12');
    expect(posteriores(depois)).toEqual(posteriores(antes));
  });

  test('o override vence a linha gerada do mesmo slot', () => {
    const gerados = gerarEscala('2026-08-12', '2026-08-12');
    const override = {
      data: '2026-08-12',
      turno: 'T2T3' as Turno,
      bloco: 'I' as const,
      funcao: 'regular' as const,
      papel: 'C' as Papel,
    };

    const mesclado = mesclarOverrides(gerados, [override]);
    const slot = mesclado.find(
      (s) => s.data === '2026-08-12' && s.turno === 'T2T3' && s.bloco === 'I',
    );

    expect(slot).toMatchObject({ papel: 'C', origem: 'manual' });
    expect(mesclado).toHaveLength(gerados.length);
  });

  test('override em slot que a escala gerada não tem é acrescentado', () => {
    // Dia 12 é fase 2: ninguém é Assistant. O admin escala um assim mesmo.
    const gerados = gerarEscala('2026-08-12', '2026-08-12');
    const mesclado = mesclarOverrides(gerados, [
      { data: '2026-08-12', turno: 'T2T3', bloco: 'I', funcao: 'assist', papel: 'C' },
    ]);

    expect(mesclado).toHaveLength(gerados.length + 1);
    expect(mesclado).toContainEqual({
      data: '2026-08-12',
      turno: 'T2T3',
      bloco: 'I',
      funcao: 'assist',
      papel: 'C',
      origem: 'manual',
    });
  });
});

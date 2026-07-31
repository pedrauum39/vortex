import { describe, expect, test } from 'vitest';
import { brtParaUtc } from './tempo';
import { dataDoTurnoAtual, horasDoTurno, janelaDoTurno, podeIniciar } from './turno';

describe('dataDoTurnoAtual', () => {
  test('T6/T1 às 02:00 ainda pertence ao turno que começou ontem', () => {
    expect(dataDoTurnoAtual('T6T1', brtParaUtc(2026, 8, 11, 2, 0))).toBe('2026-08-10');
  });

  test('T6/T1 às 22:00 pertence ao turno de hoje', () => {
    expect(dataDoTurnoAtual('T6T1', brtParaUtc(2026, 8, 10, 22, 0))).toBe('2026-08-10');
  });

  test('T6/T1 às 05:00 em ponto já é o turno do dia novo', () => {
    expect(dataDoTurnoAtual('T6T1', brtParaUtc(2026, 8, 11, 5, 0))).toBe('2026-08-11');
  });

  test('turnos que não cruzam a meia-noite usam sempre o dia corrente', () => {
    expect(dataDoTurnoAtual('T2T3', brtParaUtc(2026, 8, 10, 2, 0))).toBe('2026-08-10');
    expect(dataDoTurnoAtual('T2T3', brtParaUtc(2026, 8, 10, 6, 0))).toBe('2026-08-10');
    expect(dataDoTurnoAtual('T4T5', brtParaUtc(2026, 8, 10, 14, 0))).toBe('2026-08-10');
    expect(dataDoTurnoAtual('T4T5', brtParaUtc(2026, 8, 10, 23, 0))).toBe('2026-08-10');
  });
});

describe('janelaDoTurno', () => {
  test('T6/T1 termina no dia seguinte', () => {
    const { inicio, fim } = janelaDoTurno('T6T1', '2026-08-10');

    expect(inicio.toISOString()).toBe('2026-08-11T00:00:00.000Z'); // 21:00 BRT de 10/08
    expect(fim.toISOString()).toBe('2026-08-11T08:00:00.000Z'); //    05:00 BRT de 11/08
    expect(fim.getTime() - inicio.getTime()).toBe(8 * 60 * 60 * 1000);
  });

  test('T2/T3 e T4/T5 cabem no mesmo dia', () => {
    expect(janelaDoTurno('T2T3', '2026-08-10').inicio.toISOString()).toBe(
      '2026-08-10T08:00:00.000Z',
    );
    expect(janelaDoTurno('T2T3', '2026-08-10').fim.toISOString()).toBe('2026-08-10T16:00:00.000Z');
    expect(janelaDoTurno('T4T5', '2026-08-10').inicio.toISOString()).toBe(
      '2026-08-10T16:00:00.000Z',
    );
    expect(janelaDoTurno('T4T5', '2026-08-10').fim.toISOString()).toBe('2026-08-11T00:00:00.000Z');
  });

  test('todo turno dura 8 horas', () => {
    for (const turno of ['T2T3', 'T4T5', 'T6T1'] as const) {
      const { inicio, fim } = janelaDoTurno(turno, '2026-08-10');
      expect(fim.getTime() - inicio.getTime()).toBe(8 * 60 * 60 * 1000);
    }
  });
});

describe('podeIniciar', () => {
  test('abre 15 minutos antes do turno começar', () => {
    // T6/T1 de 10/08 começa às 21:00 BRT.
    expect(podeIniciar('T6T1', '2026-08-10', brtParaUtc(2026, 8, 10, 20, 44))).toBe(false);
    expect(podeIniciar('T6T1', '2026-08-10', brtParaUtc(2026, 8, 10, 20, 45))).toBe(true);
  });

  test('continua aberto durante o turno', () => {
    expect(podeIniciar('T6T1', '2026-08-10', brtParaUtc(2026, 8, 10, 23, 0))).toBe(true);
    expect(podeIniciar('T6T1', '2026-08-10', brtParaUtc(2026, 8, 11, 4, 59))).toBe(true);
  });

  test('fecha quando o turno acaba', () => {
    expect(podeIniciar('T6T1', '2026-08-10', brtParaUtc(2026, 8, 11, 5, 1))).toBe(false);
  });

  test('não abre horas antes', () => {
    expect(podeIniciar('T6T1', '2026-08-10', brtParaUtc(2026, 8, 10, 18, 0))).toBe(false);
    expect(podeIniciar('T2T3', '2026-08-10', brtParaUtc(2026, 8, 10, 2, 0))).toBe(false);
  });

  test('vale para os turnos que não cruzam a meia-noite', () => {
    expect(podeIniciar('T2T3', '2026-08-10', brtParaUtc(2026, 8, 10, 4, 45))).toBe(true);
    expect(podeIniciar('T4T5', '2026-08-10', brtParaUtc(2026, 8, 10, 12, 45))).toBe(true);
    expect(podeIniciar('T4T5', '2026-08-10', brtParaUtc(2026, 8, 10, 12, 44))).toBe(false);
  });
});

describe('horasDoTurno', () => {
  test('conta o turno cheio', () => {
    const h = horasDoTurno(
      'T6T1',
      '2026-08-10',
      brtParaUtc(2026, 8, 10, 21, 0),
      brtParaUtc(2026, 8, 11, 5, 0),
    );
    expect(h).toBe(8);
  });

  test('quem entra adiantado só começa a contar às 21:00', () => {
    const h = horasDoTurno(
      'T6T1',
      '2026-08-10',
      brtParaUtc(2026, 8, 10, 20, 45),
      brtParaUtc(2026, 8, 11, 5, 0),
    );
    expect(h).toBe(8);
  });

  test('quem sai atrasado para de contar às 05:00', () => {
    const h = horasDoTurno(
      'T6T1',
      '2026-08-10',
      brtParaUtc(2026, 8, 10, 21, 0),
      brtParaUtc(2026, 8, 11, 5, 40),
    );
    expect(h).toBe(8);
  });

  test('saída antecipada conta só o que trabalhou', () => {
    const h = horasDoTurno(
      'T6T1',
      '2026-08-10',
      brtParaUtc(2026, 8, 10, 21, 30),
      brtParaUtc(2026, 8, 11, 4, 45),
    );
    expect(h).toBe(7.25);
  });

  test('turno em andamento conta até agora', () => {
    const h = horasDoTurno(
      'T2T3',
      '2026-08-10',
      brtParaUtc(2026, 8, 10, 5, 0),
      null,
      brtParaUtc(2026, 8, 10, 8, 30),
    );
    expect(h).toBe(3.5);
  });

  test('turno em andamento não passa do fim oficial', () => {
    const h = horasDoTurno(
      'T2T3',
      '2026-08-10',
      brtParaUtc(2026, 8, 10, 5, 0),
      null,
      brtParaUtc(2026, 8, 10, 20, 0),
    );
    expect(h).toBe(8);
  });

  test('ponto inteiro fora da janela não conta nada', () => {
    const h = horasDoTurno(
      'T2T3',
      '2026-08-10',
      brtParaUtc(2026, 8, 10, 4, 45),
      brtParaUtc(2026, 8, 10, 4, 55),
    );
    expect(h).toBe(0);
  });
});

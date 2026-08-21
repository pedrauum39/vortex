import { describe, expect, test } from 'vitest';
import { blocoNaData, diasDeCruzamento, metaProrateada, type Periodo } from './periodos';

const periodosIssy: Periodo[] = [
  { modeloId: 'issy', bloco: 'I', inicio: '2026-07-01', fim: '2026-08-15' },
  { modeloId: 'issy', bloco: 'II', inicio: '2026-08-15', fim: null },
];

describe('blocoNaData', () => {
  test('data dentro do período fechado antigo', () => {
    expect(blocoNaData(periodosIssy, 'issy', '2026-08-10')).toBe('I');
  });

  test('data dentro do período aberto atual', () => {
    expect(blocoNaData(periodosIssy, 'issy', '2026-08-20')).toBe('II');
  });

  test('data exatamente na virada pertence ao período novo (início inclusivo)', () => {
    expect(blocoNaData(periodosIssy, 'issy', '2026-08-15')).toBe('II');
  });

  test('sem período cobrindo a data devolve null', () => {
    expect(blocoNaData(periodosIssy, 'issy', '2026-06-01')).toBeNull();
  });

  test('modelo desconhecida devolve null', () => {
    expect(blocoNaData(periodosIssy, 'outra', '2026-08-10')).toBeNull();
  });
});

describe('diasDeCruzamento', () => {
  test('período que cobre o mês inteiro dá todos os dias do mês', () => {
    const periodo = { inicio: '2026-01-01', fim: null };
    expect(diasDeCruzamento(periodo, '2026-08-01', '2026-08-31')).toBe(31);
  });

  test('período que fecha no meio do mês', () => {
    const periodo = { inicio: '2026-01-01', fim: '2026-08-16' };
    expect(diasDeCruzamento(periodo, '2026-08-01', '2026-08-31')).toBe(15);
  });

  test('período que abre no meio do mês', () => {
    const periodo = { inicio: '2026-08-15', fim: null };
    expect(diasDeCruzamento(periodo, '2026-08-01', '2026-08-31')).toBe(17);
  });

  test('período fora do mês não cruza — zero', () => {
    const periodo = { inicio: '2026-06-01', fim: '2026-06-30' };
    expect(diasDeCruzamento(periodo, '2026-08-01', '2026-08-31')).toBe(0);
  });

  test('período fecha exatamente no fim da consulta — fim é exclusivo', () => {
    const periodo = { inicio: '2026-08-01', fim: '2026-08-31' };
    expect(diasDeCruzamento(periodo, '2026-08-01', '2026-08-31')).toBe(30);
  });

  test('período abre exatamente no fim da consulta anterior — pega o dia que foi excluído', () => {
    const periodo = { inicio: '2026-08-31', fim: null };
    expect(diasDeCruzamento(periodo, '2026-08-01', '2026-08-31')).toBe(1);
  });
});

describe('metaProrateada', () => {
  test('modelo que ficou o mês inteiro no mesmo bloco dá a meta cheia nele', () => {
    const periodos: Periodo[] = [{ modeloId: 'capri', bloco: 'II', inicio: '2026-01-01', fim: null }];
    const resultado = metaProrateada(periodos, 'capri', 31000, '2026-08-01', '2026-08-31', 31);
    expect(resultado).toEqual({ I: 0, II: 31000 });
  });

  test('modelo que trocou de bloco no meio do mês reparte proporcional', () => {
    // Trocou no dia 16 (15 dias em I, 16 dias em II, mês de 31 dias).
    const periodos: Periodo[] = [
      { modeloId: 'issy', bloco: 'I', inicio: '2026-01-01', fim: '2026-08-16' },
      { modeloId: 'issy', bloco: 'II', inicio: '2026-08-16', fim: null },
    ];
    const resultado = metaProrateada(periodos, 'issy', 31000, '2026-08-01', '2026-08-31', 31);
    expect(resultado.I).toBeCloseTo((31000 * 15) / 31, 2);
    expect(resultado.II).toBeCloseTo((31000 * 16) / 31, 2);
    expect(resultado.I + resultado.II).toBeCloseTo(31000, 2);
  });

  test('modelo sem período cruzando o mês dá meta zero nos dois blocos', () => {
    const periodos: Periodo[] = [{ modeloId: 'x', bloco: 'I', inicio: '2026-01-01', fim: '2026-03-01' }];
    expect(metaProrateada(periodos, 'x', 10000, '2026-08-01', '2026-08-31', 31)).toEqual({ I: 0, II: 0 });
  });
});

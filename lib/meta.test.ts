import { describe, expect, test } from 'vitest';
import { calcularMetas, corDaMeta, metaDiariaDaPagina, percentualAtingido, temRaio } from './meta';

describe('metaDiariaDaPagina', () => {
  test('reparte a meta mensal pelo percentual do turno e pelos dias do mês', () => {
    // Meta de $10.000/mês, T6T1 é 42%, mês de 31 dias.
    expect(metaDiariaDaPagina(10000, 'T6T1', 31)).toBeCloseTo(135.48, 2);
    expect(metaDiariaDaPagina(10000, 'T2T3', 31)).toBeCloseTo(90.32, 2);
    expect(metaDiariaDaPagina(10000, 'T4T5', 31)).toBeCloseTo(96.77, 2);
  });

  test('meta zerada dá meta diária zero', () => {
    expect(metaDiariaDaPagina(0, 'T6T1', 31)).toBe(0);
  });
});

describe('calcularMetas', () => {
  test('meta total soma o mês inteiro agendado, parcial só os turnos trabalhados', () => {
    const turnos = [
      { turno: 'T6T1' as const, metasDasPaginas: [10000], trabalhado: true },
      { turno: 'T6T1' as const, metasDasPaginas: [10000], trabalhado: true },
      { turno: 'T6T1' as const, metasDasPaginas: [10000], trabalhado: false }, // ainda não chegou
    ];

    const { metaTotal, metaParcial, turnosFeitos } = calcularMetas(turnos, 30);

    const diaria = metaDiariaDaPagina(10000, 'T6T1', 30);
    expect(metaTotal).toBeCloseTo(diaria * 3, 2);
    expect(metaParcial).toBeCloseTo(diaria * 2, 2);
    expect(turnosFeitos).toBe(2);
  });

  test('double soma a meta das duas páginas trabalhadas no mesmo turno', () => {
    const turnos = [{ turno: 'T2T3' as const, metasDasPaginas: [6000, 4000], trabalhado: true }];

    const { metaParcial } = calcularMetas(turnos, 30);

    expect(metaParcial).toBeCloseTo(
      metaDiariaDaPagina(6000, 'T2T3', 30) + metaDiariaDaPagina(4000, 'T2T3', 30),
      2,
    );
  });

  test('sem turnos dá tudo zerado', () => {
    expect(calcularMetas([], 30)).toEqual({ metaTotal: 0, metaParcial: 0, turnosFeitos: 0 });
  });
});

describe('percentualAtingido', () => {
  test('calcula a porcentagem normalmente', () => {
    expect(percentualAtingido(50, 200)).toBe(25);
  });

  test('meta zerada não divide por zero — devolve null', () => {
    expect(percentualAtingido(50, 0)).toBeNull();
  });
});

describe('corDaMeta', () => {
  test('abaixo de 85% é vermelho', () => {
    expect(corDaMeta(0)).toBe('vermelho');
    expect(corDaMeta(84.99)).toBe('vermelho');
  });

  test('de 85 a 99% é amarelo', () => {
    expect(corDaMeta(85)).toBe('amarelo');
    expect(corDaMeta(99.9)).toBe('amarelo');
  });

  test('de 100 a 120% é verde', () => {
    expect(corDaMeta(100)).toBe('verde');
    expect(corDaMeta(120)).toBe('verde');
  });

  test('acima de 120% é azul neon', () => {
    expect(corDaMeta(120.01)).toBe('azul-neon');
    expect(corDaMeta(200)).toBe('azul-neon');
  });
});

describe('temRaio', () => {
  test('acima de 110% ganha o raio', () => {
    expect(temRaio(110)).toBe(false);
    expect(temRaio(110.01)).toBe(true);
    expect(temRaio(150)).toBe(true);
  });
});

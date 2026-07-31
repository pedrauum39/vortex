import { describe, expect, test } from 'vitest';
import {
  baseComissao,
  deltaTurno,
  diaDoStatement,
  linhasQueCairam,
  somaConfere,
  turnoAnterior,
  type LinhasNet,
} from './statement';

// Os três turnos de 30/07/2026 da mesma modelo, lidos dos prints reais.
// Os valores são acumulados: cada turno inclui os anteriores do mesmo dia.
const T6T1: LinhasNet = {
  assinaturas: 19.14,
  gorjetas: 184.0,
  publicacoes: 0,
  mensagens: 1602.77,
  indicacoes: 0,
};
const T2T3: LinhasNet = {
  assinaturas: 22.01,
  gorjetas: 200.0,
  publicacoes: 0,
  mensagens: 3916.3,
  indicacoes: 0,
};
const T4T5: LinhasNet = {
  assinaturas: 41.17,
  gorjetas: 408.36,
  publicacoes: 0,
  mensagens: 5974.4,
  indicacoes: 0,
};

describe('somaConfere', () => {
  test('a soma das linhas bate com o total impresso', () => {
    expect(somaConfere(T6T1, 1805.91)).toBe(true);
    expect(somaConfere(T2T3, 4138.31)).toBe(true);
  });

  test('pega o OCR trocando um dígito', () => {
    const errado = { ...T6T1, mensagens: 1602.7 };
    expect(somaConfere(errado, 1805.91)).toBe(false);
  });

  test('tolera um centavo de arredondamento', () => {
    expect(somaConfere(T6T1, 1805.92)).toBe(true);
    expect(somaConfere(T6T1, 1805.94)).toBe(false);
  });
});

describe('baseComissao', () => {
  test('soma gorjetas, publicações e mensagens — fora assinaturas e indicações', () => {
    expect(baseComissao(T6T1)).toBe(1786.77);
  });

  test('ignora assinaturas mesmo quando são o grosso do valor', () => {
    expect(baseComissao({ ...T6T1, assinaturas: 9999 })).toBe(1786.77);
  });
});

describe('turnoAnterior', () => {
  test('T6/T1 abre o dia do statement — não tem anterior', () => {
    expect(turnoAnterior('T6T1', '2026-07-30')).toBeNull();
  });

  test('o anterior do T2/T3 é o T6/T1 do dia de ontem', () => {
    expect(turnoAnterior('T2T3', '2026-07-30')).toEqual({
      turno: 'T6T1',
      data: '2026-07-29',
    });
  });

  test('o anterior do T4/T5 é o T2/T3 do mesmo dia', () => {
    expect(turnoAnterior('T4T5', '2026-07-30')).toEqual({
      turno: 'T2T3',
      data: '2026-07-30',
    });
  });
});

describe('diaDoStatement', () => {
  test('o T6/T1 aparece no statement do dia seguinte', () => {
    // 21:00 BRT de 30/07 são 00:00 UTC de 31/07 — o turno inteiro cai no dia UTC seguinte.
    expect(diaDoStatement('T6T1', '2026-07-30')).toBe('2026-07-31');
  });

  test('T2/T3 e T4/T5 ficam no próprio dia', () => {
    expect(diaDoStatement('T2T3', '2026-07-30')).toBe('2026-07-30');
    expect(diaDoStatement('T4T5', '2026-07-30')).toBe('2026-07-30');
  });

  test('os três turnos da mesma cadeia caem no mesmo dia de statement', () => {
    const anterior = turnoAnterior('T2T3', '2026-07-30')!;
    expect(diaDoStatement(anterior.turno, anterior.data)).toBe(
      diaDoStatement('T2T3', '2026-07-30'),
    );
    expect(diaDoStatement('T4T5', '2026-07-30')).toBe(diaDoStatement('T2T3', '2026-07-30'));
  });
});

describe('deltaTurno', () => {
  test('o primeiro turno do dia vale o statement inteiro', () => {
    expect(deltaTurno(T6T1, null)).toEqual(T6T1);
  });

  test('desconta o turno anterior linha a linha', () => {
    expect(deltaTurno(T2T3, T6T1)).toEqual({
      assinaturas: 2.87,
      gorjetas: 16.0,
      publicacoes: 0,
      mensagens: 2313.53,
      indicacoes: 0,
    });
  });

  test('os três turnos somados devolvem o statement do último', () => {
    const turnos = [deltaTurno(T6T1, null), deltaTurno(T2T3, T6T1), deltaTurno(T4T5, T2T3)];
    const somado = turnos.reduce((a, t) => ({
      assinaturas: a.assinaturas + t.assinaturas,
      gorjetas: a.gorjetas + t.gorjetas,
      publicacoes: a.publicacoes + t.publicacoes,
      mensagens: a.mensagens + t.mensagens,
      indicacoes: a.indicacoes + t.indicacoes,
    }));

    expect(somado.mensagens).toBeCloseTo(T4T5.mensagens, 2);
    expect(somado.gorjetas).toBeCloseTo(T4T5.gorjetas, 2);
    expect(somado.assinaturas).toBeCloseTo(T4T5.assinaturas, 2);
  });

  test('a base de comissão do turno sai do delta, não do acumulado', () => {
    // 2.329,53 e não 4.116,30 — o T2/T3 não leva o que o T6/T1 vendeu.
    expect(baseComissao(deltaTurno(T2T3, T6T1))).toBe(2329.53);
  });
});

describe('linhasQueCairam', () => {
  test('não acusa nada numa cadeia normal', () => {
    expect(linhasQueCairam(T2T3, T6T1)).toEqual([]);
  });

  test('acusa a linha que diminuiu — possível refund', () => {
    const comEstorno = { ...T2T3, gorjetas: 150.0 };
    expect(linhasQueCairam(comEstorno, T6T1)).toEqual(['gorjetas']);
  });

  test('acusa todas as linhas que caíram', () => {
    const outroDia = { ...T6T1, gorjetas: 1, mensagens: 1 };
    expect(linhasQueCairam(outroDia, T2T3).sort()).toEqual([
      'assinaturas',
      'gorjetas',
      'mensagens',
    ]);
  });

  test('não acusa quando não há turno anterior', () => {
    expect(linhasQueCairam(T6T1, null)).toEqual([]);
  });
});

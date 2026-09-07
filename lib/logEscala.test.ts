import { describe, expect, test } from 'vitest';
import { agruparPorDiaDaMudanca, diaMes, textoDoLog, type EntradaLog } from './logEscala';

const base: EntradaLog = {
  id: '1',
  criadoEm: '2026-09-07T12:00:00.000Z',
  data: '2026-09-10',
  turno: 'T2T3',
  bloco: 'I',
  funcao: 'regular',
  repSaiu: 'Carolinne P.',
  cargoSaiu: 'tertius',
  repEntrou: 'Léo Grimaldi',
  cargoEntrou: 'secundus',
  modelosDoBloco: ['Joyce', 'Riley'],
};

describe('agruparPorDiaDaMudanca', () => {
  test('duas mudanças do mesmo dia BRT caem no mesmo grupo', () => {
    const grupos = agruparPorDiaDaMudanca([
      { ...base, id: 'a', criadoEm: '2026-09-07T12:00:00.000Z' },
      { ...base, id: 'b', criadoEm: '2026-09-07T20:00:00.000Z' },
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].diaMudanca).toBe('2026-09-07');
    expect(grupos[0].itens.map((i) => i.id)).toEqual(['a', 'b']);
  });

  test('grupos vêm do mais recente pro mais antigo', () => {
    const grupos = agruparPorDiaDaMudanca([
      { ...base, id: 'velho', criadoEm: '2026-09-05T12:00:00.000Z' },
      { ...base, id: 'novo', criadoEm: '2026-09-07T12:00:00.000Z' },
    ]);
    expect(grupos.map((g) => g.diaMudanca)).toEqual(['2026-09-07', '2026-09-05']);
  });

  test('vira o dia pelo fuso BRT (UTC-3)', () => {
    // 2026-09-08T02:00Z = 2026-09-07 23:00 em São Paulo
    const grupos = agruparPorDiaDaMudanca([{ ...base, criadoEm: '2026-09-08T02:00:00.000Z' }]);
    expect(grupos[0].diaMudanca).toBe('2026-09-07');
  });

  test('lista vazia → nenhum grupo', () => {
    expect(agruparPorDiaDaMudanca([])).toEqual([]);
  });
});

describe('diaMes', () => {
  test('formata DD/MM', () => {
    expect(diaMes('2026-09-10')).toBe('10/09');
  });
});

describe('textoDoLog', () => {
  test('bloco com Sai e Entra', () => {
    const texto = textoDoLog(agruparPorDiaDaMudanca([base]));
    expect(texto).toBe(
      [
        'Mudanças feitas 07/09',
        '',
        'T2/T3 · 10/09 · Joyce + Riley',
        'Sai: Carolinne P. (Tertius)',
        'Entra: Léo Grimaldi (Secundus)',
      ].join('\n'),
    );
  });

  test('item só com Entra (slot estava vazio) e sem modelo do bloco', () => {
    const texto = textoDoLog(
      agruparPorDiaDaMudanca([
        { ...base, repSaiu: null, cargoSaiu: null, modelosDoBloco: [], funcao: 'assist' },
      ]),
    );
    expect(texto).toBe(
      ['Mudanças feitas 07/09', '', 'T2/T3 (Assistant) · 10/09', 'Entra: Léo Grimaldi (Secundus)'].join(
        '\n',
      ),
    );
  });
});

import { describe, expect, test } from 'vitest';
import { agruparLog, cabecalhoDoGrupo, diaMes, textoDoLog, type EntradaLog } from './logEscala';

const base: EntradaLog = {
  id: '1',
  criadoEm: '2026-09-08T12:00:00.000Z',
  data: '2026-09-08',
  turno: 'T6T1',
  bloco: 'II',
  funcao: 'regular',
  repSaiu: 'Natasha Tem Tem',
  cargoSaiu: 'knight_primaris',
  repEntrou: 'Diogo Ciesielski',
  cargoEntrou: 'tertius',
  alteradoPor: 'Pedro Ribeiro',
  modelosDoBloco: ['Capri Cavanni'],
};

describe('agruparLog', () => {
  test('agrupa por pessoa+dia, depois turno+dia, depois time', () => {
    const [grupo] = agruparLog([base]);
    expect(grupo.diaMudanca).toBe('2026-09-08');
    expect(grupo.alteradoPor).toBe('Pedro Ribeiro');
    expect(grupo.turnos).toHaveLength(1);
    expect(grupo.turnos[0]).toMatchObject({ turno: 'T6T1', data: '2026-09-08' });
    expect(grupo.turnos[0].times[0]).toEqual({
      titulo: 'Capri Cavanni',
      lados: [
        { rotulo: 'Sai', nome: 'Natasha Tem Tem', qualificador: 'Knight Primaris' },
        { rotulo: 'Entra', nome: 'Diogo Ciesielski', qualificador: 'Tertius' },
      ],
    });
  });

  test('regular e assistant do mesmo time+dia caem no mesmo bloco; assistant vira "(Assistant)"', () => {
    const [grupo] = agruparLog([
      {
        ...base,
        id: 'assist',
        bloco: 'I',
        funcao: 'assist',
        modelosDoBloco: ['Joyce Zarza', 'Riley'],
        repSaiu: 'Diogo Ciesielski',
        cargoSaiu: 'tertius',
        repEntrou: null,
        cargoEntrou: null,
      },
      {
        ...base,
        id: 'reg',
        bloco: 'I',
        funcao: 'regular',
        modelosDoBloco: ['Joyce Zarza', 'Riley'],
        repSaiu: 'Pedro Ribeiro',
        cargoSaiu: 'grand_primaris',
        repEntrou: 'Natasha Tem Tem',
        cargoEntrou: 'knight_primaris',
      },
    ]);
    expect(grupo.turnos[0].times).toHaveLength(1);
    expect(grupo.turnos[0].times[0]).toEqual({
      titulo: 'Joyce Zarza + Riley',
      lados: [
        { rotulo: 'Sai', nome: 'Diogo Ciesielski', qualificador: 'Assistant' },
        { rotulo: 'Sai', nome: 'Pedro Ribeiro', qualificador: 'Gran Primaris' },
        { rotulo: 'Entra', nome: 'Natasha Tem Tem', qualificador: 'Knight Primaris' },
      ],
    });
  });

  test('turnos ordenados por dia crescente, mesmo com criado_em desc', () => {
    const [grupo] = agruparLog([
      { ...base, id: 'novo', criadoEm: '2026-09-08T20:00:00.000Z', data: '2026-09-12' },
      { ...base, id: 'velho', criadoEm: '2026-09-08T08:00:00.000Z', data: '2026-09-08' },
    ]);
    expect(grupo.turnos.map((t) => t.data)).toEqual(['2026-09-08', '2026-09-12']);
  });

  test('mesmo dia: turnos ordenados por dia e depois pela ordem T2T3/T4T5/T6T1', () => {
    const [grupo] = agruparLog([
      { ...base, id: 'a', turno: 'T6T1', data: '2026-09-10' },
      { ...base, id: 'b', turno: 'T2T3', data: '2026-09-10' },
      { ...base, id: 'c', turno: 'T4T5', data: '2026-09-09' },
    ]);
    expect(grupo.turnos.map((t) => `${t.turno} ${t.data}`)).toEqual([
      'T4T5 2026-09-09',
      'T2T3 2026-09-10',
      'T6T1 2026-09-10',
    ]);
  });

  test('duas pessoas no mesmo dia BRT → dois grupos, mais recente primeiro', () => {
    const grupos = agruparLog([
      { ...base, id: 'p1', criadoEm: '2026-09-08T20:00:00.000Z', alteradoPor: 'Pedro Ribeiro' },
      { ...base, id: 'a1', criadoEm: '2026-09-08T10:00:00.000Z', alteradoPor: 'Ana' },
    ]);
    expect(grupos.map((g) => g.alteradoPor)).toEqual(['Pedro Ribeiro', 'Ana']);
  });

  test('dias de mudança diferentes → grupos do mais recente pro mais antigo', () => {
    const grupos = agruparLog([
      { ...base, id: 'velho', criadoEm: '2026-09-05T12:00:00.000Z' },
      { ...base, id: 'novo', criadoEm: '2026-09-07T12:00:00.000Z' },
    ]);
    expect(grupos.map((g) => g.diaMudanca)).toEqual(['2026-09-07', '2026-09-05']);
  });

  test('vira o dia da mudança pelo fuso BRT (UTC-3)', () => {
    // 2026-09-08T02:00Z = 2026-09-07 23:00 em São Paulo
    const [grupo] = agruparLog([{ ...base, criadoEm: '2026-09-08T02:00:00.000Z' }]);
    expect(grupo.diaMudanca).toBe('2026-09-07');
  });

  test('bloco sem modelo ativa cai no rótulo "Time 1/2"', () => {
    const [grupo] = agruparLog([{ ...base, bloco: 'I', modelosDoBloco: [] }]);
    expect(grupo.turnos[0].times[0].titulo).toBe('Time 1');
  });

  test('lista vazia → nenhum grupo', () => {
    expect(agruparLog([])).toEqual([]);
  });
});

describe('diaMes', () => {
  test('formata DD/MM', () => {
    expect(diaMes('2026-09-10')).toBe('10/09');
  });
});

describe('cabecalhoDoGrupo', () => {
  test('com autor', () => {
    expect(cabecalhoDoGrupo(agruparLog([base])[0])).toBe('Mudanças por Pedro Ribeiro · 08/09');
  });

  test('sem autor', () => {
    expect(cabecalhoDoGrupo(agruparLog([{ ...base, alteradoPor: null }])[0])).toBe('Mudanças feitas 08/09');
  });
});

describe('textoDoLog', () => {
  test('estrutura em negrito, com ➤ no turno e time em bloco', () => {
    const texto = textoDoLog(
      agruparLog([
        {
          ...base,
          id: 'capri',
          bloco: 'II',
          funcao: 'regular',
          modelosDoBloco: ['Capri Cavanni'],
          repSaiu: 'Natasha Tem Tem',
          cargoSaiu: 'knight_primaris',
          repEntrou: 'Diogo Ciesielski',
          cargoEntrou: 'tertius',
        },
        {
          ...base,
          id: 'joyce-assist',
          bloco: 'I',
          funcao: 'assist',
          modelosDoBloco: ['Joyce Zarza', 'Riley'],
          repSaiu: 'Diogo Ciesielski',
          cargoSaiu: 'tertius',
          repEntrou: null,
          cargoEntrou: null,
        },
      ]),
    );
    expect(texto).toBe(
      [
        '**Mudanças por Pedro Ribeiro · 08/09**',
        '',
        '➤ **T6/T1 · 08/09**',
        '',
        '**Capri Cavanni**',
        'Sai: Natasha Tem Tem (Knight Primaris)',
        'Entra: Diogo Ciesielski (Tertius)',
        '',
        '**Joyce Zarza + Riley**',
        'Sai: Diogo Ciesielski (Assistant)',
      ].join('\n'),
    );
  });

  test('dois turnos: separados por linha em branco, em ordem de dia', () => {
    const texto = textoDoLog(
      agruparLog([
        { ...base, id: 'd12', data: '2026-09-12', criadoEm: '2026-09-08T20:00:00.000Z' },
        { ...base, id: 'd08', data: '2026-09-08', criadoEm: '2026-09-08T08:00:00.000Z' },
      ]),
    );
    expect(texto).toBe(
      [
        '**Mudanças por Pedro Ribeiro · 08/09**',
        '',
        '➤ **T6/T1 · 08/09**',
        '',
        '**Capri Cavanni**',
        'Sai: Natasha Tem Tem (Knight Primaris)',
        'Entra: Diogo Ciesielski (Tertius)',
        '',
        '➤ **T6/T1 · 12/09**',
        '',
        '**Capri Cavanni**',
        'Sai: Natasha Tem Tem (Knight Primaris)',
        'Entra: Diogo Ciesielski (Tertius)',
      ].join('\n'),
    );
  });
});

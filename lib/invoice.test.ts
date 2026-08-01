import { describe, expect, test } from 'vitest';
import { REGRA_PADRAO } from './comissao';
import { linhasDoSlot, totaisDoPeriodo, type SlotResolvido } from './invoice';
import type { LinhasNet } from './statement';
import { brtParaUtc } from './tempo';

// A cadeia real de 30/07: o T6/T1 de 29/07 abriu o dia com 1.805,91 acumulado.
const ACUMULADO_ANTERIOR: LinhasNet = {
  assinaturas: 19.14,
  gorjetas: 184.0,
  publicacoes: 0,
  mensagens: 1602.77,
  indicacoes: 0,
};
const ACUMULADO_T2T3: LinhasNet = {
  assinaturas: 22.01,
  gorjetas: 200.0,
  publicacoes: 0,
  mensagens: 3916.3,
  indicacoes: 0,
};

const slotBase = (): SlotResolvido => ({
  data: '2026-07-30',
  turno: 'T2T3',
  bloco: 'I',
  regular: {
    repId: 'leo',
    cargo: 'secundus',
    valorHora: 2,
    clockIn: brtParaUtc(2026, 7, 30, 5, 0),
    clockOut: brtParaUtc(2026, 7, 30, 13, 0),
    modelos: [
      {
        modeloId: 'm1',
        statement: ACUMULADO_T2T3,
        anterior: ACUMULADO_ANTERIOR,
        anteriorPendente: false,
      },
    ],
  },
  assist: null,
});

const agora = brtParaUtc(2026, 7, 31, 12, 0);

describe('linhasDoSlot', () => {
  test('paga horas e comissão sobre a base do turno, não sobre o acumulado', () => {
    const [linha] = linhasDoSlot(slotBase(), REGRA_PADRAO, agora);

    // Base do turno = 2.329,53 (e não 4.116,30, que é o acumulado do dia).
    expect(linha.base).toBe(2329.53);
    expect(linha.comissao).toBe(93.18); // 4% de secundus
    expect(linha.valorHoras).toBe(16); // 8h x $2
    expect(linha.total).toBe(109.18);
    expect(linha.pendente).toBe(false);
    expect(linha.parcial).toBe(false);
  });

  test('com assistente, a fatia sai do rep e vira linha do assistente', () => {
    const slot = slotBase();
    slot.assist = {
      repId: 'oliver',
      cargo: 'tertius',
      valorHora: 2,
      clockIn: brtParaUtc(2026, 7, 30, 5, 0),
      clockOut: brtParaUtc(2026, 7, 30, 13, 0),
    };

    const linhas = linhasDoSlot(slot, REGRA_PADRAO, agora);
    const regular = linhas.find((l) => l.repId === 'leo')!;
    const assist = linhas.find((l) => l.repId === 'oliver')!;

    expect(regular.comissao).toBe(83.86);
    expect(assist.comissao).toBe(9.32);
    expect(regular.comissao + assist.comissao).toBe(93.18);

    expect(assist.funcao).toBe('assist');
    expect(assist.base).toBe(0); // o assistente não tem venda própria
    expect(assist.total).toBe(25.32); // 16 de horas + 9,32
  });

  test('sem statement, a comissão é zero e a linha fica pendente', () => {
    const slot = slotBase();
    slot.regular!.modelos[0].statement = null;

    const [linha] = linhasDoSlot(slot, REGRA_PADRAO, agora);

    expect(linha.comissao).toBe(0);
    expect(linha.valorHoras).toBe(16); // as horas não dependem do print
    expect(linha.pendente).toBe(true);
  });

  test('statement do turno anterior faltando também deixa pendente', () => {
    const slot = slotBase();
    slot.regular!.modelos[0].anterior = null;
    slot.regular!.modelos[0].anteriorPendente = true;

    const [linha] = linhasDoSlot(slot, REGRA_PADRAO, agora);

    expect(linha.pendente).toBe(true);
    // Não desconta nada: descontar zero inflaria o turno.
    expect(linha.comissao).toBe(0);
  });

  test('turno em andamento conta as horas até agora e marca parcial', () => {
    const slot = slotBase();
    slot.regular!.clockOut = null;

    const [linha] = linhasDoSlot(
      slot,
      REGRA_PADRAO,
      brtParaUtc(2026, 7, 30, 9, 0), // 4h depois do início
    );

    expect(linha.horas).toBe(4);
    expect(linha.valorHoras).toBe(8);
    expect(linha.parcial).toBe(true);
  });

  test('quem entrou adiantado não ganha hora a mais', () => {
    const slot = slotBase();
    slot.regular!.clockIn = brtParaUtc(2026, 7, 30, 4, 45);

    const [linha] = linhasDoSlot(slot, REGRA_PADRAO, agora);
    expect(linha.horas).toBe(8);
  });

  test('double: a base soma o delta das duas modelos', () => {
    const slot = slotBase();
    // Segunda modelo do turno, com sua própria cadeia — sem turno anterior
    // (abre o dia para essa modelo).
    slot.regular!.modelos.push({
      modeloId: 'm2',
      statement: { assinaturas: 0, gorjetas: 50, publicacoes: 0, mensagens: 450, indicacoes: 0 },
      anterior: null,
      anteriorPendente: false,
    });

    const [linha] = linhasDoSlot(slot, REGRA_PADRAO, agora);

    // m1: 2329,53 (como no primeiro teste). m2: 50 + 450 = 500.
    expect(linha.base).toBe(2829.53);
    expect(linha.pendente).toBe(false);
  });

  test('double: uma modelo pendente não trava a base da outra, mas marca pendente', () => {
    const slot = slotBase();
    slot.regular!.modelos.push({
      modeloId: 'm2',
      statement: null,
      anterior: null,
      anteriorPendente: false,
    });

    const [linha] = linhasDoSlot(slot, REGRA_PADRAO, agora);

    expect(linha.base).toBe(2329.53); // só a m1, que está resolvida
    expect(linha.pendente).toBe(true);
  });
});

describe('totaisDoPeriodo', () => {
  test('soma as linhas e conta o que está em aberto', () => {
    const cheio = linhasDoSlot(slotBase(), REGRA_PADRAO, agora);

    const semStatement = slotBase();
    semStatement.data = '2026-07-31';
    semStatement.regular!.clockIn = brtParaUtc(2026, 7, 31, 5, 0);
    semStatement.regular!.clockOut = brtParaUtc(2026, 7, 31, 13, 0);
    semStatement.regular!.modelos[0].statement = null;

    const totais = totaisDoPeriodo([
      ...cheio,
      ...linhasDoSlot(semStatement, REGRA_PADRAO, agora),
    ]);

    expect(totais.turnos).toBe(2);
    expect(totais.horas).toBe(16);
    expect(totais.valorHoras).toBe(32);
    expect(totais.comissao).toBe(93.18);
    expect(totais.total).toBe(125.18);
    expect(totais.pendentes).toBe(1);
  });

  test('período vazio zera tudo', () => {
    expect(totaisDoPeriodo([])).toEqual({
      turnos: 0,
      horas: 0,
      valorHoras: 0,
      comissao: 0,
      total: 0,
      parciais: 0,
      pendentes: 0,
    });
  });
});

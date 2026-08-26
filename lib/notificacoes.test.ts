import { describe, expect, test } from 'vitest';
import { estaEncerrada, estaVisivelHoje } from './notificacoes';

describe('estaVisivelHoje', () => {
  test('desativada nunca é visível, de nenhum tipo', () => {
    expect(estaVisivelHoje({ tipo: 'popup', dataInicio: null, dataFim: null, ativo: false }, '2026-08-26')).toBe(
      false,
    );
    expect(
      estaVisivelHoje(
        { tipo: 'aviso', dataInicio: '2026-08-01', dataFim: '2026-08-31', ativo: false },
        '2026-08-26',
      ),
    ).toBe(false);
  });

  test('popup e todo ativos são sempre visíveis, sem checagem de data', () => {
    expect(estaVisivelHoje({ tipo: 'popup', dataInicio: null, dataFim: null, ativo: true }, '2026-08-26')).toBe(
      true,
    );
    expect(estaVisivelHoje({ tipo: 'todo', dataInicio: null, dataFim: null, ativo: true }, '2026-08-26')).toBe(
      true,
    );
  });

  test('aviso só é visível dentro de [data_inicio, data_fim]', () => {
    const n = { tipo: 'aviso' as const, dataInicio: '2026-08-20', dataFim: '2026-08-25', ativo: true };
    expect(estaVisivelHoje(n, '2026-08-19')).toBe(false); // antes de começar
    expect(estaVisivelHoje(n, '2026-08-20')).toBe(true); // primeiro dia
    expect(estaVisivelHoje(n, '2026-08-25')).toBe(true); // último dia
    expect(estaVisivelHoje(n, '2026-08-26')).toBe(false); // já passou
  });
});

describe('estaEncerrada', () => {
  test('desativada manualmente está sempre encerrada', () => {
    expect(estaEncerrada({ tipo: 'todo', dataFim: null, ativo: false }, '2026-08-26', [{ lidaEm: null }])).toBe(
      true,
    );
  });

  test('aviso com data_fim já passada está encerrado mesmo com gente pendente', () => {
    expect(
      estaEncerrada({ tipo: 'aviso', dataFim: '2026-08-20', ativo: true }, '2026-08-26', [{ lidaEm: null }]),
    ).toBe(true);
  });

  test('aviso ainda dentro do prazo, com alguém pendente, não está encerrado', () => {
    expect(
      estaEncerrada({ tipo: 'aviso', dataFim: '2026-08-30', ativo: true }, '2026-08-26', [{ lidaEm: null }]),
    ).toBe(false);
  });

  test('todo/popup encerram quando todo mundo confirmou', () => {
    expect(
      estaEncerrada({ tipo: 'todo', dataFim: null, ativo: true }, '2026-08-26', [
        { lidaEm: '2026-08-20T10:00:00Z' },
        { lidaEm: '2026-08-21T10:00:00Z' },
      ]),
    ).toBe(true);
  });

  test('todo/popup continuam ativos enquanto falta alguém confirmar', () => {
    expect(
      estaEncerrada({ tipo: 'popup', dataFim: null, ativo: true }, '2026-08-26', [
        { lidaEm: '2026-08-20T10:00:00Z' },
        { lidaEm: null },
      ]),
    ).toBe(false);
  });

  test('sem destinatário nenhum (lista vazia) nunca encerra sozinho por confirmação', () => {
    expect(estaEncerrada({ tipo: 'todo', dataFim: null, ativo: true }, '2026-08-26', [])).toBe(false);
  });
});

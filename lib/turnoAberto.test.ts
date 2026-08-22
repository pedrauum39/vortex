import { describe, expect, test } from 'vitest';
import { precisaAtencao } from './turnoAberto';

describe('precisaAtencao', () => {
  test('turno iniciado e não fechado precisa de atenção', () => {
    expect(precisaAtencao({ data: '2026-08-10', shift_logs: [{ clock_out_at: null }] }, '2026-08-18')).toBe(true);
  });

  test('turno fechado normalmente não precisa de atenção', () => {
    expect(
      precisaAtencao(
        { data: '2026-08-10', shift_logs: [{ clock_out_at: '2026-08-10T13:00:00Z' }] },
        '2026-08-18',
      ),
    ).toBe(false);
  });

  test('turno sem log e com data já passada precisa de atenção (nunca foi aberto)', () => {
    expect(precisaAtencao({ data: '2026-08-10', shift_logs: [] }, '2026-08-18')).toBe(true);
  });

  test('turno sem log ainda no futuro/hoje não precisa de atenção (só ainda não chegou a hora)', () => {
    expect(precisaAtencao({ data: '2026-08-18', shift_logs: [] }, '2026-08-18')).toBe(false);
    expect(precisaAtencao({ data: '2026-08-20', shift_logs: [] }, '2026-08-18')).toBe(false);
  });

  test('turno fechado normalmente mas com comissão pendente (falta statement) precisa de atenção', () => {
    expect(
      precisaAtencao(
        { data: '2026-08-10', shift_logs: [{ clock_out_at: '2026-08-10T13:00:00Z' }] },
        '2026-08-18',
        true,
      ),
    ).toBe(true);
  });

  test('turno fechado e sem comissão pendente não precisa de atenção', () => {
    expect(
      precisaAtencao(
        { data: '2026-08-10', shift_logs: [{ clock_out_at: '2026-08-10T13:00:00Z' }] },
        '2026-08-18',
        false,
      ),
    ).toBe(false);
  });
});

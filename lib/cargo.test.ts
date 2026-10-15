import { describe, expect, test } from 'vitest';
import { cargoNaData, type CargoAnterior } from './cargo';

describe('cargoNaData', () => {
  const anteriores: CargoAnterior[] = [
    { rep_id: 'carol', cargo: 'tertius', ate: '2026-09-01' },
    { rep_id: 'carol', cargo: 'secundus', ate: '2026-10-14' },
  ];

  test('sem histórico, é o cargo atual', () => {
    expect(cargoNaData(anteriores, 'carlos', 'secundus', '2026-10-01')).toBe('secundus');
  });

  test('a partir da data de corte, é o cargo atual', () => {
    expect(cargoNaData(anteriores, 'carol', 'adept_primaris', '2026-10-14')).toBe('adept_primaris');
  });

  test('antes do corte, é o cargo antigo — o mais recente que ainda cobre a data', () => {
    expect(cargoNaData(anteriores, 'carol', 'adept_primaris', '2026-10-13')).toBe('secundus');
    expect(cargoNaData(anteriores, 'carol', 'adept_primaris', '2026-08-31')).toBe('tertius');
  });
});

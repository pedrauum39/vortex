import { describe, expect, test } from 'vitest';
import { diferencaDias } from './tempo';

describe('diferencaDias', () => {
  test('mesma data dá zero', () => {
    expect(diferencaDias('2026-08-14', '2026-08-14')).toBe(0);
  });

  test('conta dias corridos, ignorando fuso', () => {
    expect(diferencaDias('2026-08-14', '2026-08-20')).toBe(6);
  });

  test('data depois é negativo', () => {
    expect(diferencaDias('2026-08-20', '2026-08-14')).toBe(-6);
  });

  test('atravessa virada de mês', () => {
    expect(diferencaDias('2026-08-30', '2026-09-02')).toBe(3);
  });
});

import { describe, expect, test } from 'vitest';
import { cargoEfetivo } from './tipos';

describe('cargoEfetivo', () => {
  test('sem cover, usa o cargo real do rep', () => {
    expect(cargoEfetivo('secundus', null)).toBe('secundus');
  });

  test('com cover, o cover vence — mesmo sendo um cargo diferente do rep', () => {
    expect(cargoEfetivo('secundus', 'tertius')).toBe('tertius');
  });
});

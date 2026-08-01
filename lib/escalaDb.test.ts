import { describe, expect, test } from 'vitest';
import { gerarEscala } from './escala';
import { slotsParaLinhas } from './escalaDb';
import type { Rep } from './tipos';

const reps = [
  { id: 'r-caro', nome_curto: 'Carolinne P.', turno: 'T2T3', papel: 'A' },
  { id: 'r-leo', nome_curto: 'Léo Grimaldi', turno: 'T2T3', papel: 'B' },
  { id: 'r-oliver', nome_curto: 'Oliver Melo', turno: 'T2T3', papel: 'C' },
  { id: 'r-gabi', nome_curto: 'Gabriela Storini', turno: 'T4T5', papel: 'A' },
  { id: 'r-igna', nome_curto: 'Ignacio Canelo', turno: 'T4T5', papel: 'B' },
  { id: 'r-carlos', nome_curto: 'Carlos de Lucca', turno: 'T4T5', papel: 'C' },
  { id: 'r-pedro', nome_curto: 'Pedro Ribeiro', turno: 'T6T1', papel: 'A' },
  { id: 'r-nat', nome_curto: 'Natasha Tem Tem', turno: 'T6T1', papel: 'B' },
  { id: 'r-diogo', nome_curto: 'Diogo Ciesielski', turno: 'T6T1', papel: 'C' },
] as Rep[];

describe('slotsParaLinhas', () => {
  test('resolve o rep pelo par turno+papel', () => {
    // 10/08 é fase 0: no T6/T1 folga o B, então A no bloco I e C no bloco II.
    const linhas = slotsParaLinhas(gerarEscala('2026-08-10', '2026-08-10'), reps);
    const t6 = linhas.filter((l) => l.turno === 'T6T1');

    expect(t6).toEqual([
      {
        data: '2026-08-10',
        turno: 'T6T1',
        bloco: 'I',
        funcao: 'regular',
        rep_id: 'r-pedro',
        origem: 'gerado',
      },
      {
        data: '2026-08-10',
        turno: 'T6T1',
        bloco: 'II',
        funcao: 'regular',
        rep_id: 'r-diogo',
        origem: 'gerado',
      },
    ]);
  });

  test('ignora slots de rep que não existe na lista', () => {
    const semT2T3 = reps.filter((r) => r.turno !== 'T2T3');
    const linhas = slotsParaLinhas(gerarEscala('2026-08-10', '2026-08-10'), semT2T3);

    expect(linhas.some((l) => l.turno === 'T2T3')).toBe(false);
    expect(linhas).toHaveLength(4);
  });
});

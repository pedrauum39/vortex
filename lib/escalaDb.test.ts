import { describe, expect, test } from 'vitest';
import { gerarEscala } from './escala';
import { slotsParaLinhas } from './escalaDb';
import type { Rep } from './tipos';

const reps = [
  { id: 'r-caro', nome_curto: 'Carolinne P.', turno: 'T2T3', papel: 'A', ativo: true },
  { id: 'r-leo', nome_curto: 'Léo Grimaldi', turno: 'T2T3', papel: 'B', ativo: true },
  { id: 'r-oliver', nome_curto: 'Oliver Melo', turno: 'T2T3', papel: 'C', ativo: true },
  { id: 'r-gabi', nome_curto: 'Gabriela Storini', turno: 'T4T5', papel: 'A', ativo: true },
  { id: 'r-igna', nome_curto: 'Ignacio Canelo', turno: 'T4T5', papel: 'B', ativo: true },
  { id: 'r-carlos', nome_curto: 'Carlos de Lucca', turno: 'T4T5', papel: 'C', ativo: true },
  { id: 'r-pedro', nome_curto: 'Pedro Ribeiro', turno: 'T6T1', papel: 'A', ativo: true },
  { id: 'r-nat', nome_curto: 'Natasha Tem Tem', turno: 'T6T1', papel: 'B', ativo: true },
  { id: 'r-diogo', nome_curto: 'Diogo Ciesielski', turno: 'T6T1', papel: 'C', ativo: true },
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

  test('rep inativo com o mesmo turno+papel de um rep ativo não rouba o slot dele', () => {
    // Caso real: os reps sintéticos de "Cover" (ativo=false) têm turno/papel
    // só de enfeite pra satisfazer a constraint, e coincidem com o de reps
    // de verdade — o gerador nunca pode escalar o cover automaticamente.
    const comCoverFalso: Rep[] = [
      ...reps,
      { id: 'r-cover', nome_curto: 'Cover Tertius', turno: 'T2T3', papel: 'C', ativo: false } as Rep,
    ];
    const linhas = slotsParaLinhas(gerarEscala('2026-08-10', '2026-08-10'), comCoverFalso);

    expect(linhas.some((l) => l.rep_id === 'r-cover')).toBe(false);
    expect(linhas.some((l) => l.turno === 'T2T3' && l.bloco === 'II' && l.rep_id === 'r-oliver')).toBe(true);
  });
});

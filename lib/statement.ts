// Leitura do statement e o que ela vira em dinheiro do turno.
//
// O statement da plataforma é ACUMULADO no dia: cada turno mostra o que foi
// vendido nele mais tudo o que veio antes no mesmo dia. O que o rep fez no
// próprio turno é a diferença para o statement do turno anterior — calculada
// linha a linha, porque a base de comissão não inclui todas as linhas.
//
// O dia do statement é UTC, e é isso que coloca o T6/T1 no dia seguinte:
// 21:00–05:00 BRT são 00:00–08:00 UTC do dia posterior.

import { somarDias } from './tempo';
import type { Turno } from './tipos';

export type LinhasNet = {
  assinaturas: number;
  gorjetas: number;
  publicacoes: number;
  mensagens: number;
  indicacoes: number;
};

export const LINHAS = [
  'assinaturas',
  'gorjetas',
  'publicacoes',
  'mensagens',
  'indicacoes',
] as const;

/** Linhas que entram na comissão. Assinaturas e indicações ficam de fora. */
const COMISSIONAVEIS = ['gorjetas', 'publicacoes', 'mensagens'] as const;

const arred = (valor: number) => Math.round(valor * 100) / 100;

export function baseComissao(linhas: LinhasNet): number {
  return arred(COMISSIONAVEIS.reduce((soma, linha) => soma + linhas[linha], 0));
}

export function totalDasLinhas(linhas: LinhasNet): number {
  return arred(LINHAS.reduce((soma, linha) => soma + linhas[linha], 0));
}

/**
 * A soma das linhas tem que dar o total impresso. É a checagem que pega o OCR
 * lendo um dígito errado, de graça, antes do rep sequer olhar.
 */
export function somaConfere(linhas: LinhasNet, totalImpresso: number): boolean {
  return Math.abs(totalDasLinhas(linhas) - totalImpresso) <= 0.02;
}

/** Dia UTC do statement em que um turno aparece. */
export function diaDoStatement(turno: Turno, data: string): string {
  return turno === 'T6T1' ? somarDias(data, 1) : data;
}

/**
 * O turno imediatamente anterior na cadeia do mesmo dia de statement, ou null
 * se este abre o dia. A ordem é T6/T1 → T2/T3 → T4/T5.
 */
export function turnoAnterior(
  turno: Turno,
  data: string,
): { turno: Turno; data: string } | null {
  if (turno === 'T6T1') return null;
  if (turno === 'T2T3') return { turno: 'T6T1', data: somarDias(data, -1) };
  return { turno: 'T2T3', data };
}

/** O que este turno vendeu: o acumulado dele menos o acumulado do anterior. */
export function deltaTurno(atual: LinhasNet, anterior: LinhasNet | null): LinhasNet {
  if (!anterior) return atual;

  return Object.fromEntries(
    LINHAS.map((linha) => [linha, arred(atual[linha] - anterior[linha])]),
  ) as LinhasNet;
}

/**
 * Linhas que diminuíram em relação ao turno anterior. Num acumulado isso não
 * deveria acontecer — ou houve refund na plataforma, ou o print é do dia
 * errado, de outra modelo, ou os turnos entraram fora de ordem.
 */
export function linhasQueCairam(atual: LinhasNet, anterior: LinhasNet | null): string[] {
  if (!anterior) return [];
  return LINHAS.filter((linha) => arred(atual[linha] - anterior[linha]) < 0);
}

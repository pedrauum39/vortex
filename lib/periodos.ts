// Resolve qual bloco (time) uma modelo pertencia numa data específica, a
// partir do histórico de model_bloco_periodos — usado pra atribuir vendas
// antigas ao time de quando elas aconteceram, não ao time atual da modelo.

import { diferencaDias } from './tempo';
import type { Bloco } from './tipos';

const arred = (valor: number) => Math.round(valor * 100) / 100;

export type Periodo = {
  modeloId: string;
  bloco: Bloco;
  inicio: string; // 'YYYY-MM-DD'
  fim: string | null; // null = período aberto (time atual)
};

/** O bloco que a modelo pertencia numa data, ou null se nenhum período cobre. */
export function blocoNaData(periodos: Periodo[], modeloId: string, data: string): Bloco | null {
  const periodo = periodos.find(
    (p) => p.modeloId === modeloId && p.inicio <= data && (p.fim === null || p.fim > data),
  );
  return periodo?.bloco ?? null;
}

const maxData = (a: string, b: string) => (a > b ? a : b);
const minData = (a: string, b: string) => (a < b ? a : b);

/** Quantos dias (inclusive) de um período caem dentro de [inicio, fim]. Zero se não cruza. */
export function diasDeCruzamento(
  periodo: { inicio: string; fim: string | null },
  inicio: string,
  fim: string,
): number {
  const de = maxData(periodo.inicio, inicio);
  const ate = minData(periodo.fim ?? fim, fim);
  if (de > ate) return 0;

  // If the period's fim is within our range, treat it as an exclusive boundary
  // (the first day NOT in the period)
  if (periodo.fim !== null && periodo.fim <= fim) {
    return diferencaDias(de, periodo.fim);
  }

  return diferencaDias(de, ate) + 1;
}

/**
 * Reparte a meta mensal de uma modelo entre os blocos que ela pertenceu
 * dentro de [inicio, fim], proporcional aos dias em cada um.
 */
export function metaProrateada(
  periodos: Periodo[],
  modeloId: string,
  metaMensal: number,
  inicio: string,
  fim: string,
  diasDoMes: number,
): Record<Bloco, number> {
  const porBloco: Record<Bloco, number> = { I: 0, II: 0 };
  if (diasDoMes <= 0) return porBloco;

  for (const periodo of periodos.filter((p) => p.modeloId === modeloId)) {
    const dias = diasDeCruzamento(periodo, inicio, fim);
    if (dias === 0) continue;
    porBloco[periodo.bloco] = arred(porBloco[periodo.bloco] + (metaMensal * dias) / diasDoMes);
  }
  return porBloco;
}

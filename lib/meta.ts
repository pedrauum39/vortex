// Meta de vendas por página (modelo), repartida entre os 3 turnos por um
// percentual fixo e pelos dias do mês (calendário, não turnos) — dá a meta
// diária daquela página naquele turno.
//
// Meta total soma o mês inteiro já agendado pro rep (mesmo os dias
// futuros) — é o alvo fixo do mês. Meta parcial soma só os turnos que ele
// já trabalhou, pra medir o ritmo antes do mês fechar.

import type { Turno } from './tipos';

export const PERCENTUAL_META_TURNO: Record<Turno, number> = {
  T6T1: 0.42,
  T2T3: 0.28,
  T4T5: 0.3,
};

const arred = (valor: number) => Math.round(valor * 100) / 100;

/** Meta diária de UMA página, pro turno dado, num mês com `diasDoMes` dias. */
export function metaDiariaDaPagina(metaMensal: number, turno: Turno, diasDoMes: number): number {
  if (diasDoMes <= 0) return 0;
  return arred((metaMensal * PERCENTUAL_META_TURNO[turno]) / diasDoMes);
}

export type TurnoParaMeta = {
  turno: Turno;
  /** Meta mensal de cada página que conta pro turno: real (shift_log_models)
   * se já foi trabalhado, roster do time se ainda não. */
  metasDasPaginas: number[];
  trabalhado: boolean;
};

export type MetasDoRep = {
  metaTotal: number;
  metaParcial: number;
  turnosFeitos: number;
};

/** Soma a meta diária de cada turno agendado no mês — total conta todos, parcial só os trabalhados. */
export function calcularMetas(turnos: TurnoParaMeta[], diasDoMes: number): MetasDoRep {
  let metaTotal = 0;
  let metaParcial = 0;
  let turnosFeitos = 0;

  for (const t of turnos) {
    const metaDoTurno = t.metasDasPaginas.reduce(
      (soma, meta) => soma + metaDiariaDaPagina(meta, t.turno, diasDoMes),
      0,
    );
    metaTotal += metaDoTurno;
    if (t.trabalhado) {
      metaParcial += metaDoTurno;
      turnosFeitos++;
    }
  }

  return { metaTotal: arred(metaTotal), metaParcial: arred(metaParcial), turnosFeitos };
}

/** % de uma meta atingida por um valor vendido. null se a meta é 0 (nada configurado). */
export function percentualAtingido(vendido: number, meta: number): number | null {
  if (meta <= 0) return null;
  return arred((vendido / meta) * 100);
}

export type CorMeta = 'vermelho' | 'amarelo' | 'verde' | 'azul-neon';

/** Faixa de cor do % de meta atingido: <85 vermelho, 85–99 amarelo, 100–120 verde, >120 azul neon. */
export function corDaMeta(percentual: number): CorMeta {
  if (percentual < 85) return 'vermelho';
  if (percentual < 100) return 'amarelo';
  if (percentual <= 120) return 'verde';
  return 'azul-neon';
}

/** Acima de 110% da meta ganha o raio, independente da cor. */
export function temRaio(percentual: number): boolean {
  return percentual > 110;
}

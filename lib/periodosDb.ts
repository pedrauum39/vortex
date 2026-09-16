// Busca do histórico de bloco por modelo (model_bloco_periodos) — usado por
// qualquer tela que precise saber "de quem era o roster nessa data", não só
// o roster atual. Ver lib/periodos.ts pra lógica pura (blocoNaData etc).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Periodo, PeriodoMeta } from './periodos';
import type { Bloco } from './tipos';

export async function buscarPeriodos(db: SupabaseClient): Promise<Periodo[]> {
  const { data, error } = await db.from('model_bloco_periodos').select('model_id, bloco, inicio, fim');
  if (error) throw new Error(error.message);
  return ((data ?? []) as { model_id: string; bloco: Bloco; inicio: string; fim: string | null }[]).map((p) => ({
    modeloId: p.model_id,
    bloco: p.bloco,
    inicio: p.inicio,
    fim: p.fim,
  }));
}

export async function buscarPeriodosDeMeta(db: SupabaseClient): Promise<PeriodoMeta[]> {
  const { data, error } = await db.from('model_meta_periodos').select('model_id, meta_mensal, inicio, fim');
  if (error) throw new Error(error.message);
  return ((data ?? []) as { model_id: string; meta_mensal: number; inicio: string; fim: string | null }[]).map(
    (p) => ({
      modeloId: p.model_id,
      metaMensal: Number(p.meta_mensal),
      inicio: p.inicio,
      fim: p.fim,
    }),
  );
}

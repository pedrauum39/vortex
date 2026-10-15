// Cargo por data. `reps.cargo` é o cargo de HOJE; quando um rep muda de cargo,
// o anterior fica em `rep_cargos_anteriores` com a data em que deixou de valer
// (`ate`, exclusiva). Turno antes dessa data paga no cargo antigo.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Cargo } from './tipos';

export type CargoAnterior = { rep_id: string; cargo: Cargo; ate: string };

/** O cargo que o rep tinha no dia: o do período antigo mais cedo que ainda cobre a data, senão o atual. */
export function cargoNaData(
  anteriores: CargoAnterior[],
  repId: string,
  cargoAtual: Cargo,
  data: string,
): Cargo {
  let vigente: CargoAnterior | null = null;
  for (const a of anteriores) {
    if (a.rep_id !== repId || data >= a.ate) continue;
    if (!vigente || a.ate < vigente.ate) vigente = a;
  }
  return vigente?.cargo ?? cargoAtual;
}

export async function buscarCargosAnteriores(db: SupabaseClient): Promise<CargoAnterior[]> {
  const { data } = await db.from('rep_cargos_anteriores').select('rep_id, cargo, ate');
  return (data ?? []) as CargoAnterior[];
}

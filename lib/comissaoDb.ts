import type { SupabaseClient } from '@supabase/supabase-js';
import { REGRA_PADRAO, type RegraComissao } from './comissao';

/** A regra com maior `vigente_desde` que já vale na data — versionada, editável pelo admin. */
export async function buscarRegraVigente(db: SupabaseClient, data: string): Promise<RegraComissao> {
  const { data: linha } = await db
    .from('commission_rules')
    .select('regra')
    .lte('vigente_desde', data)
    .order('vigente_desde', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (linha?.regra as RegraComissao) ?? REGRA_PADRAO;
}

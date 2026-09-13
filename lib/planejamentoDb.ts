// "Planejar turno" — bloco de notas do rep pra preparar mass messages e
// respostas antes do turno. Uma linha por (rep, data, modelo); `itens` é a
// lista ordenada e MISTA do editor: parágrafos livres e blocos "mass"
// (numerados, arrastáveis) intercalados como o rep quiser.

import type { SupabaseClient } from '@supabase/supabase-js';

export type ItemTexto = { id: string; tipo: 'texto'; html: string };
export type ItemMass = { id: string; tipo: 'mass'; texto: string; nota: string };
export type ItemPlanejamento = ItemTexto | ItemMass;

/** Uma aba: uma data com uma ou mais modelos (sub-abas), cada uma com seus itens. */
export type AbaPlanejamento = {
  data: string;
  modelos: { modeloId: string; itens: ItemPlanejamento[] }[];
};

/** Todas as abas do rep, mais recentes primeiro. */
export async function buscarPlanejamentos(db: SupabaseClient, repId: string): Promise<AbaPlanejamento[]> {
  const { data, error } = await db
    .from('planejamentos_turno')
    .select('data, modelo_id, itens')
    .eq('rep_id', repId)
    .order('data', { ascending: false });
  if (error) throw new Error(error.message);

  const porData = new Map<string, AbaPlanejamento>();
  for (const linha of (data ?? []) as { data: string; modelo_id: string; itens: ItemPlanejamento[] }[]) {
    const aba = porData.get(linha.data) ?? { data: linha.data, modelos: [] };
    aba.modelos.push({ modeloId: linha.modelo_id, itens: linha.itens ?? [] });
    porData.set(linha.data, aba);
  }
  return [...porData.values()];
}

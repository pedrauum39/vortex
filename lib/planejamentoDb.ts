// "Planejar turno" — bloco de notas do rep pra preparar mass messages e
// respostas antes do turno. Uma linha por (rep, data, modelo); dentro dela,
// `itens` é a lista ordenada dos blocos "mass" (arrastáveis, numerados) e
// `textoLivre` é a área de notebook livre, sem numeração nem drag.

import type { SupabaseClient } from '@supabase/supabase-js';

export type ItemMass = { id: string; texto: string; nota: string };

/** Uma aba: uma data com uma ou mais modelos (sub-abas), cada uma com seus blocos + notebook livre. */
export type AbaPlanejamento = {
  data: string;
  modelos: { modeloId: string; itens: ItemMass[]; textoLivre: string }[];
};

/** Todas as abas do rep, mais recentes primeiro. */
export async function buscarPlanejamentos(db: SupabaseClient, repId: string): Promise<AbaPlanejamento[]> {
  const { data, error } = await db
    .from('planejamentos_turno')
    .select('data, modelo_id, itens, texto_livre')
    .eq('rep_id', repId)
    .order('data', { ascending: false });
  if (error) throw new Error(error.message);

  const porData = new Map<string, AbaPlanejamento>();
  for (const linha of (data ?? []) as {
    data: string;
    modelo_id: string;
    itens: ItemMass[];
    texto_livre: string;
  }[]) {
    const aba = porData.get(linha.data) ?? { data: linha.data, modelos: [] };
    aba.modelos.push({ modeloId: linha.modelo_id, itens: linha.itens ?? [], textoLivre: linha.texto_livre ?? '' });
    porData.set(linha.data, aba);
  }
  return [...porData.values()];
}

// "Planejar turno" — bloco de notas do rep pra preparar mass messages e
// respostas antes do turno. Uma linha por (rep, data, modelo); `itens` é a
// lista ordenada e MISTA do editor: parágrafos livres e blocos "mass"
// (numerados, arrastáveis) intercalados como o rep quiser.

import type { SupabaseClient } from '@supabase/supabase-js';

export type ItemTexto = { id: string; tipo: 'texto'; html: string };

/** `variante: 'ponto22'` é o mesmo bloco de mass, só que com preço/unlocks/
 *  views a mais — ver criarItemMass()/criarItemPonto22() no client. */
export type ItemMass = {
  id: string;
  tipo: 'mass';
  variante: 'padrao' | 'ponto22';
  texto: string;
  nota: string;
  horario: string; // 'HH:MM' ou '' (sem horário marcado)
  alarmeAtivo: boolean;
  preco: string;
  unlocks: string;
  views: string;
  enviada: 'sim' | 'nao' | null;
  funcionou: 'sim' | 'nao' | null;
};

export type ItemPlanejamento = ItemTexto | ItemMass;

/** Uma aba: uma data com uma ou mais modelos (sub-abas), cada uma com seus itens. */
export type AbaPlanejamento = {
  data: string;
  modelos: { modeloId: string; itens: ItemPlanejamento[] }[];
};

/** Preenche os campos novos (horário, alarme, validadores, .22) com um
 *  default seguro pra planejamento salvo antes dessa feature existir. */
function normalizarItem(item: Record<string, unknown> & { id: string; tipo: string }): ItemPlanejamento {
  if (item.tipo === 'mass') {
    return {
      id: item.id,
      tipo: 'mass',
      variante: item.variante === 'ponto22' ? 'ponto22' : 'padrao',
      texto: typeof item.texto === 'string' ? item.texto : '',
      nota: typeof item.nota === 'string' ? item.nota : '',
      horario: typeof item.horario === 'string' ? item.horario : '',
      alarmeAtivo: item.alarmeAtivo !== false,
      preco: typeof item.preco === 'string' ? item.preco : '',
      unlocks: typeof item.unlocks === 'string' ? item.unlocks : '',
      views: typeof item.views === 'string' ? item.views : '',
      enviada: item.enviada === 'sim' || item.enviada === 'nao' ? item.enviada : null,
      funcionou: item.funcionou === 'sim' || item.funcionou === 'nao' ? item.funcionou : null,
    };
  }
  return { id: item.id, tipo: 'texto', html: typeof item.html === 'string' ? item.html : '' };
}

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
    aba.modelos.push({
      modeloId: linha.modelo_id,
      itens: ((linha.itens ?? []) as Record<string, unknown>[]).map((i) => normalizarItem(i as never)),
    });
    porData.set(linha.data, aba);
  }
  return [...porData.values()];
}

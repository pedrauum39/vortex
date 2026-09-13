'use server';

import { revalidatePath } from 'next/cache';
import { exigirRep } from '@/lib/auth';
import type { ItemPlanejamento } from '@/lib/planejamentoDb';
import { sanitizarConteudo } from '@/lib/sanitizarHtml';
import { criarClienteServidor } from '@/lib/supabase/server';

/** Nova aba (data + modelo). Se já existir, não faz nada — é só o rep
 *  trocando pra ela, o conteúdo continua o que já estava. */
export async function criarAba(data: string, modeloId: string) {
  const rep = await exigirRep();
  const supabase = await criarClienteServidor();

  const { error } = await supabase
    .from('planejamentos_turno')
    .upsert(
      { rep_id: rep.id, data, modelo_id: modeloId, itens: [] },
      { onConflict: 'rep_id,data,modelo_id', ignoreDuplicates: true },
    );
  if (error) throw new Error(error.message);

  revalidatePath('/planejar');
}

export async function apagarAba(data: string, modeloId: string) {
  const rep = await exigirRep();
  const supabase = await criarClienteServidor();

  const { error } = await supabase
    .from('planejamentos_turno')
    .delete()
    .eq('rep_id', rep.id)
    .eq('data', data)
    .eq('modelo_id', modeloId);
  if (error) throw new Error(error.message);

  revalidatePath('/planejar');
}

function sanitizarItens(itens: ItemPlanejamento[]): ItemPlanejamento[] {
  return itens.map((item) =>
    item.tipo === 'mass'
      ? {
          id: item.id,
          tipo: 'mass' as const,
          variante: item.variante === 'ponto22' ? ('ponto22' as const) : ('padrao' as const),
          texto: sanitizarConteudo(item.texto),
          nota: sanitizarConteudo(item.nota),
          horario: typeof item.horario === 'string' ? item.horario : '',
          alarmeAtivo: item.alarmeAtivo !== false,
          preco: typeof item.preco === 'string' ? item.preco : '',
          unlocks: typeof item.unlocks === 'string' ? item.unlocks : '',
          views: typeof item.views === 'string' ? item.views : '',
          enviada: item.enviada === 'sim' || item.enviada === 'nao' ? item.enviada : null,
          funcionou: item.funcionou === 'sim' || item.funcionou === 'nao' ? item.funcionou : null,
        }
      : { id: item.id, tipo: 'texto' as const, html: sanitizarConteudo(item.html) },
  );
}

/** Grava a lista de itens inteira (a ordem do array já é a ordem de
 *  exibição — reordenar/quebrar/apagar bloco no editor já manda o array
 *  pronto), sanitizada no servidor antes de gravar. */
export async function salvarItens(data: string, modeloId: string, itens: ItemPlanejamento[]) {
  const rep = await exigirRep();
  const supabase = await criarClienteServidor();

  const { error } = await supabase.from('planejamentos_turno').upsert(
    {
      rep_id: rep.id,
      data,
      modelo_id: modeloId,
      itens: sanitizarItens(itens),
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: 'rep_id,data,modelo_id' },
  );
  if (error) throw new Error(error.message);
}

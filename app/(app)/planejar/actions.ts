'use server';

import { revalidatePath } from 'next/cache';
import { exigirRep } from '@/lib/auth';
import type { ItemMass } from '@/lib/planejamentoDb';
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
      { rep_id: rep.id, data, modelo_id: modeloId, itens: [], texto_livre: '' },
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

/** Grava os blocos mass (a ordem do array já é a ordem de exibição) e o
 *  texto livre inteiros — sanitizados no servidor antes de gravar. */
export async function salvarConteudo(data: string, modeloId: string, itens: ItemMass[], textoLivre: string) {
  const rep = await exigirRep();
  const supabase = await criarClienteServidor();

  const itensSanitizados = itens.map((item) => ({
    id: item.id,
    texto: sanitizarConteudo(item.texto),
    nota: sanitizarConteudo(item.nota),
  }));

  const { error } = await supabase.from('planejamentos_turno').upsert(
    {
      rep_id: rep.id,
      data,
      modelo_id: modeloId,
      itens: itensSanitizados,
      texto_livre: sanitizarConteudo(textoLivre),
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: 'rep_id,data,modelo_id' },
  );
  if (error) throw new Error(error.message);
}

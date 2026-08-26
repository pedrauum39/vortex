'use server';

import { revalidatePath } from 'next/cache';
import { exigirRep } from '@/lib/auth';
import { confirmarNotificacao } from '@/lib/notificacoesDb';
import { criarClienteServidor } from '@/lib/supabase/server';

/** Chamada tanto pelo popup (fila no layout raiz) quanto pelos cards de
 * aviso/todo no dashboard — o único campo gravado é lida_em, o rótulo do
 * botão que muda por tipo é decisão só de UI (ROTULO_CONFIRMAR). */
export async function confirmarNotificacaoAction(notificacaoId: string) {
  const rep = await exigirRep();
  const supabase = await criarClienteServidor();

  await confirmarNotificacao(supabase, notificacaoId, rep.id);

  revalidatePath('/');
}

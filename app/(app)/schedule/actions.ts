'use server';

import { revalidatePath } from 'next/cache';
import { ehAdmin, repAtual } from '@/lib/auth';
import { materializarEscala } from '@/lib/escalaDb';
import { criarClienteServidor } from '@/lib/supabase/server';

/** Materializa a escala de um período. Só admin (ou primaris). */
export async function gerarEscalaDoPeriodo(dataInicio: string, dataFim: string) {
  const rep = await repAtual();
  if (!ehAdmin(rep)) throw new Error('Só admin pode gerar a escala.');

  const supabase = await criarClienteServidor();
  await materializarEscala(supabase, dataInicio, dataFim);

  revalidatePath('/schedule');
  revalidatePath('/');
}

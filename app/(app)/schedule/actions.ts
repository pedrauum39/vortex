'use server';

import { revalidatePath } from 'next/cache';
import { repAtual } from '@/lib/auth';
import { materializarEscala } from '@/lib/escalaDb';
import { criarClienteServidor } from '@/lib/supabase/server';

/** Materializa a escala de um período. Só admin. */
export async function gerarEscalaDoPeriodo(dataInicio: string, dataFim: string) {
  const rep = await repAtual();
  if (rep?.role !== 'admin') throw new Error('Só admin pode gerar a escala.');

  const supabase = await criarClienteServidor();
  await materializarEscala(supabase, dataInicio, dataFim);

  revalidatePath('/schedule');
  revalidatePath('/');
}

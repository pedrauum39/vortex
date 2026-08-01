'use server';

import { revalidatePath } from 'next/cache';
import { exigirRep } from '@/lib/auth';
import { criarClienteServidor } from '@/lib/supabase/server';

async function exigirAdmin() {
  const rep = await exigirRep();
  if (rep.role !== 'admin') throw new Error('Só admin.');
}

export async function criarModelo(nome: string) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  const { error } = await supabase.from('models').insert({ nome });
  if (error) throw new Error(error.message);

  revalidatePath('/admin/models');
  revalidatePath('/admin/turnos');
}

export async function renomearModelo(id: string, nome: string) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  const { error } = await supabase.from('models').update({ nome }).eq('id', id);
  if (error) throw new Error(error.message);

  revalidatePath('/admin/models');
  revalidatePath('/admin/turnos');
  revalidatePath('/schedule');
}

/** shifts.model_id tem ON DELETE SET NULL — apagar não quebra turnos existentes. */
export async function apagarModelo(id: string) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  const { error } = await supabase.from('models').delete().eq('id', id);
  if (error) throw new Error(error.message);

  revalidatePath('/admin/models');
  revalidatePath('/admin/turnos');
}

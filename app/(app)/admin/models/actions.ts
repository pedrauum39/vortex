'use server';

import { revalidatePath } from 'next/cache';
import { exigirRep } from '@/lib/auth';
import { criarClienteServidor } from '@/lib/supabase/server';
import type { Bloco } from '@/lib/tipos';

async function exigirAdmin() {
  const rep = await exigirRep();
  if (rep.role !== 'admin') throw new Error('Só admin.');
}

function revalidar() {
  revalidatePath('/admin/models');
  revalidatePath('/admin/turnos');
  revalidatePath('/schedule');
  revalidatePath('/turno');
}

export async function criarModelo(nome: string, bloco: Bloco) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  const { error } = await supabase.from('models').insert({ nome, bloco });
  if (error) throw new Error(error.message);

  revalidar();
}

export async function renomearModelo(id: string, nome: string) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  const { error } = await supabase.from('models').update({ nome }).eq('id', id);
  if (error) throw new Error(error.message);

  revalidar();
}

export async function definirAtivaModelo(id: string, ativa: boolean) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  const { error } = await supabase.from('models').update({ ativa }).eq('id', id);
  if (error) throw new Error(error.message);

  revalidar();
}

export async function definirMetaMensal(id: string, metaMensal: number) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  const { error } = await supabase.from('models').update({ meta_mensal: metaMensal }).eq('id', id);
  if (error) throw new Error(error.message);

  revalidar();
}

/** shifts.model_id tem ON DELETE SET NULL — apagar não quebra turnos existentes. */
export async function apagarModelo(id: string) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  const { error } = await supabase.from('models').delete().eq('id', id);
  if (error) throw new Error(error.message);

  revalidar();
}

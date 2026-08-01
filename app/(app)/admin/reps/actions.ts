'use server';

import { revalidatePath } from 'next/cache';
import { exigirRep } from '@/lib/auth';
import { criarClienteServidor } from '@/lib/supabase/server';
import type { Cargo, Papel, Turno } from '@/lib/tipos';

async function exigirAdmin() {
  const rep = await exigirRep();
  if (rep.role !== 'admin') throw new Error('Só admin.');
}

export async function atualizarRep(
  repId: string,
  dados: {
    nome_curto: string;
    nome_oficial: string;
    turno: Turno;
    papel: Papel;
    cargo: Cargo;
    valor_hora: number;
    ativo: boolean;
  },
) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  const { error } = await supabase.from('reps').update(dados).eq('id', repId);
  if (error) throw new Error(error.message);

  revalidatePath('/admin/reps');
}

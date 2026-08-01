'use server';

import { revalidatePath } from 'next/cache';
import { exigirRep } from '@/lib/auth';
import { criarClienteAdmin, criarClienteServidor } from '@/lib/supabase/server';
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

/**
 * Liga o rep a uma conta do Supabase Auth já criada por fora (Dashboard →
 * Authentication → Users). Não cria conta nem senha nenhuma aqui — só
 * procura pelo e-mail e grava o id encontrado em `reps.auth_user_id`.
 */
export async function vincularLogin(repId: string, email: string) {
  await exigirAdmin();

  const emailNormalizado = email.trim().toLowerCase();
  if (!emailNormalizado) throw new Error('Digite o e-mail da conta.');

  const admin = criarClienteAdmin();
  const { data, error } = await admin.auth.admin.listUsers();
  if (error) throw new Error(error.message);

  const usuario = data.users.find((u) => u.email?.toLowerCase() === emailNormalizado);
  if (!usuario) {
    throw new Error('Nenhuma conta com esse e-mail. Crie primeiro no Supabase Dashboard → Authentication → Users.');
  }

  const supabase = await criarClienteServidor();
  const { error: erroUpdate } = await supabase
    .from('reps')
    .update({ auth_user_id: usuario.id })
    .eq('id', repId);
  if (erroUpdate) throw new Error(erroUpdate.message);

  revalidatePath('/admin/reps');
}

export async function desvincularLogin(repId: string) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  const { error } = await supabase.from('reps').update({ auth_user_id: null }).eq('id', repId);
  if (error) throw new Error(error.message);

  revalidatePath('/admin/reps');
}

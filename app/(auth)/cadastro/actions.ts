'use server';

import { criarClienteAdmin, criarClienteServidor } from '@/lib/supabase/server';

/**
 * O rep recém-cadastrado escolheu o próprio nome na lista — vincula a conta
 * que ele acabou de criar direto ao rep, sem precisar do admin. Só falha se
 * o nome já tiver login vinculado (alguém já reivindicou antes).
 */
export async function reivindicarNome(repId: string) {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sessão não encontrada — tenta entrar de novo.');

  const admin = criarClienteAdmin();

  const { data: rep } = await admin.from('reps').select('auth_user_id').eq('id', repId).maybeSingle();
  if (!rep) throw new Error('Nome não encontrado.');
  if (rep.auth_user_id) throw new Error('Esse nome já tem login vinculado. Fale com o admin.');

  const { error } = await admin.from('reps').update({ auth_user_id: user.id }).eq('id', repId);
  if (error) throw new Error(error.message);
}

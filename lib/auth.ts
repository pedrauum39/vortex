import { redirect } from 'next/navigation';
import { criarClienteServidor } from './supabase/server';
import type { Rep } from './tipos';

/** O rep correspondente ao usuário logado, ou null. */
export async function repAtual(): Promise<Rep | null> {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('reps')
    .select('*')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  return data as Rep | null;
}

export async function exigirRep(): Promise<Rep> {
  const rep = await repAtual();
  if (!rep) redirect('/login');
  return rep;
}

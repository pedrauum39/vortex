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

/**
 * Login sem rep vinculado tem que cair em /aguardando, nunca em /login: o
 * middleware manda quem já tem sessão pra fora de /login, e essa página
 * mandaria de volta pra /login por não achar o rep — loop infinito de
 * redirect pra quem se cadastrou mas ainda não foi vinculado pelo admin.
 */
export async function exigirRep(): Promise<Rep> {
  const rep = await repAtual();
  if (rep) return rep;

  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  redirect(user ? '/aguardando' : '/login');
}

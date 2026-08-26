'use server';

import { revalidatePath } from 'next/cache';
import { ehAdmin, exigirRep } from '@/lib/auth';
import type { TipoNotificacao } from '@/lib/notificacoes';
import { criarNotificacao, desativarNotificacao } from '@/lib/notificacoesDb';
import { criarClienteServidor } from '@/lib/supabase/server';

async function exigirAdmin() {
  const rep = await exigirRep();
  if (!ehAdmin(rep)) throw new Error('Só admin.');
}

function revalidar() {
  revalidatePath('/admin/notificacoes');
  revalidatePath('/');
}

export async function criarNotificacaoAction(dados: {
  tipo: TipoNotificacao;
  mensagem: string;
  dataInicio: string | null;
  dataFim: string | null;
  repIds: string[];
}) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  await criarNotificacao(supabase, dados);

  revalidar();
}

export async function desativarNotificacaoAction(id: string) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  await desativarNotificacao(supabase, id);

  revalidar();
}

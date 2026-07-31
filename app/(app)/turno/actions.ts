'use server';

import { revalidatePath } from 'next/cache';
import { exigirRep } from '@/lib/auth';
import { criarClienteServidor } from '@/lib/supabase/server';

function revalidar() {
  revalidatePath('/turno');
  revalidatePath('/');
}

/** Clock in. `clock_in_at` vem do default now() do Postgres, em UTC. */
export async function iniciarTurno(shiftId: string, modelIdReal: string | null) {
  const rep = await exigirRep();
  const supabase = await criarClienteServidor();

  const { error } = await supabase.from('shift_logs').insert({
    shift_id: shiftId,
    rep_id: rep.id,
    model_id_real: modelIdReal,
  });
  if (error) throw new Error(error.message);

  revalidar();
}

/** Registra que o rep trabalhou uma modelo diferente da escalada. */
export async function trocarModelo(logId: string, modelIdReal: string | null) {
  await exigirRep();
  const supabase = await criarClienteServidor();

  const { error } = await supabase
    .from('shift_logs')
    .update({ model_id_real: modelIdReal })
    .eq('id', logId);
  if (error) throw new Error(error.message);

  revalidar();
}

export async function finalizarTurno(
  logId: string,
  dados: { saiuAntes: boolean; motivoSaida: string | null },
) {
  await exigirRep();
  const supabase = await criarClienteServidor();

  const { error } = await supabase
    .from('shift_logs')
    .update({
      clock_out_at: new Date().toISOString(),
      saiu_antes: dados.saiuAntes,
      motivo_saida: dados.saiuAntes ? dados.motivoSaida : null,
    })
    .eq('id', logId);
  if (error) throw new Error(error.message);

  revalidar();
}

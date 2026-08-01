'use server';

import { revalidatePath } from 'next/cache';
import { exigirRep } from '@/lib/auth';
import { criarClienteServidor } from '@/lib/supabase/server';
import { brtParaUtc } from '@/lib/tempo';
import type { Bloco, Funcao, Turno } from '@/lib/tipos';

async function exigirAdmin() {
  const rep = await exigirRep();
  if (rep.role !== 'admin') throw new Error('Só admin.');
}

function revalidar() {
  revalidatePath('/admin/turnos');
  revalidatePath('/invoice');
  revalidatePath('/schedule');
  revalidatePath('/');
}

/** 'YYYY-MM-DDTHH:mm' de um <input type="datetime-local"> — sempre em BRT. */
function localParaUtc(valor: string): Date {
  const [data, hora] = valor.split('T');
  const [ano, mes, dia] = data.split('-').map(Number);
  const [h, m] = hora.split(':').map(Number);
  return brtParaUtc(ano, mes, dia, h, m);
}

/**
 * Cria ou atualiza um turno na data/turno/bloco/função escolhidos. `origem` é
 * sempre 'manual' — é o índice único que dá precedência a esta linha sobre o
 * que gerarEscala() geraria no mesmo slot.
 */
export async function criarTurno(dados: {
  data: string;
  turno: Turno;
  bloco: Bloco;
  funcao: Funcao;
  repId: string;
  modelId: string | null;
}) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  const { error } = await supabase.from('shifts').upsert(
    {
      data: dados.data,
      turno: dados.turno,
      bloco: dados.bloco,
      funcao: dados.funcao,
      rep_id: dados.repId,
      model_id: dados.modelId,
      origem: 'manual',
    },
    { onConflict: 'data,turno,bloco,funcao' },
  );
  if (error) throw new Error(error.message);

  revalidar();
}

/** Apaga o turno. Em cascata some o ponto e o statement que estivessem nele. */
export async function apagarTurno(shiftId: string) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  const { error } = await supabase.from('shifts').delete().eq('id', shiftId);
  if (error) throw new Error(error.message);

  revalidar();
}

/** Simula o clock in/out com horários escolhidos à mão, sem passar pela janela oficial. */
export async function simularPonto(dados: {
  shiftId: string;
  repId: string;
  entrada: string; // datetime-local, BRT
  saida: string | null;
}) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  const { error } = await supabase.from('shift_logs').upsert(
    {
      shift_id: dados.shiftId,
      rep_id: dados.repId,
      clock_in_at: localParaUtc(dados.entrada).toISOString(),
      clock_out_at: dados.saida ? localParaUtc(dados.saida).toISOString() : null,
    },
    { onConflict: 'shift_id,rep_id' },
  );
  if (error) throw new Error(error.message);

  revalidar();
}

export async function apagarPonto(shiftLogId: string) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  const { error } = await supabase.from('shift_logs').delete().eq('id', shiftLogId);
  if (error) throw new Error(error.message);

  revalidar();
}

/** Grava um statement com valores à mão, sem passar pelo OCR. */
export async function simularStatement(dados: {
  shiftLogId: string;
  assinaturas: number;
  gorjetas: number;
  publicacoes: number;
  mensagens: number;
  indicacoes: number;
}) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  const total =
    dados.assinaturas + dados.gorjetas + dados.publicacoes + dados.mensagens + dados.indicacoes;

  const { error } = await supabase.from('statements').upsert(
    {
      shift_log_id: dados.shiftLogId,
      net_total: total,
      net_assinaturas: dados.assinaturas,
      net_gorjetas: dados.gorjetas,
      net_publicacoes: dados.publicacoes,
      net_mensagens: dados.mensagens,
      net_indicacoes: dados.indicacoes,
      corrigido_manualmente: true,
    },
    { onConflict: 'shift_log_id' },
  );
  if (error) throw new Error(error.message);

  revalidar();
}

export async function apagarStatement(statementId: string) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  const { error } = await supabase.from('statements').delete().eq('id', statementId);
  if (error) throw new Error(error.message);

  revalidar();
}

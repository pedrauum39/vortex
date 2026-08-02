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
 * que gerarEscala() geraria no mesmo slot. A modelo é escolhida depois, ao
 * simular o ponto — aqui só se define quem ocupa o slot.
 */
export async function criarTurno(dados: {
  data: string;
  turno: Turno;
  bloco: Bloco;
  funcao: Funcao;
  repId: string;
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
      origem: 'manual',
    },
    { onConflict: 'data,turno,bloco,funcao' },
  );
  if (error) throw new Error(error.message);

  revalidar();
}

type Slot = { data: string; turno: Turno; bloco: Bloco; funcao: Funcao; repId: string | null };

/**
 * Define quem ocupa um slot da grade.
 *
 * Trocar o dono de um slot que já existe apaga a linha antiga em vez de só
 * atualizar o rep_id: um upsert por cima deixaria o ponto/statement do rep
 * anterior pendurado no mesmo shift_id, já que a troca de dono não é o mesmo
 * turno continuando — é outra pessoa nele.
 */
async function aplicarSlot(supabase: Awaited<ReturnType<typeof criarClienteServidor>>, slot: Slot) {
  const { data: existente } = await supabase
    .from('shifts')
    .select('id, rep_id')
    .eq('data', slot.data)
    .eq('turno', slot.turno)
    .eq('bloco', slot.bloco)
    .eq('funcao', slot.funcao)
    .maybeSingle();

  if (existente && existente.rep_id !== slot.repId) {
    const { error } = await supabase.from('shifts').delete().eq('id', existente.id);
    if (error) throw new Error(error.message);
  }

  if (slot.repId && (!existente || existente.rep_id !== slot.repId)) {
    const { error } = await supabase.from('shifts').insert({
      data: slot.data,
      turno: slot.turno,
      bloco: slot.bloco,
      funcao: slot.funcao,
      rep_id: slot.repId,
      origem: 'manual',
    });
    if (error) throw new Error(error.message);
  }
}

/**
 * Grava de uma vez todas as células alteradas na grade — o admin edita
 * várias e só um clique em "Salvar alterações" manda tudo junto, em vez de
 * cada troca de select gravar sozinha na hora.
 */
export async function salvarGrade(alteracoes: Slot[]) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  for (const slot of alteracoes) await aplicarSlot(supabase, slot);

  revalidar();
}

/** Apaga o turno. Em cascata some o ponto e os statements que estivessem nele. */
export async function apagarTurno(shiftId: string) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  const { error } = await supabase.from('shifts').delete().eq('id', shiftId);
  if (error) throw new Error(error.message);

  revalidar();
}

/** Simula o clock in/out com horários e modelo(s) escolhidos à mão. */
export async function simularPonto(dados: {
  shiftId: string;
  repId: string;
  entrada: string; // datetime-local, BRT
  saida: string | null;
  modeloIds: string[];
}) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  if (dados.modeloIds.length === 0) throw new Error('Escolha ao menos uma modelo.');

  const { data: log, error } = await supabase
    .from('shift_logs')
    .upsert(
      {
        shift_id: dados.shiftId,
        rep_id: dados.repId,
        clock_in_at: localParaUtc(dados.entrada).toISOString(),
        clock_out_at: dados.saida ? localParaUtc(dados.saida).toISOString() : null,
      },
      { onConflict: 'shift_id,rep_id' },
    )
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  await supabase.from('shift_log_models').delete().eq('shift_log_id', log.id);
  const { error: erroModelos } = await supabase
    .from('shift_log_models')
    .insert(dados.modeloIds.map((modelId) => ({ shift_log_id: log.id, model_id: modelId })));
  if (erroModelos) throw new Error(erroModelos.message);

  revalidar();
}

export async function apagarPonto(shiftLogId: string) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  const { error } = await supabase.from('shift_logs').delete().eq('id', shiftLogId);
  if (error) throw new Error(error.message);

  revalidar();
}

/** Grava o statement de uma modelo específica do turno, com valores à mão. */
export async function simularStatement(dados: {
  shiftLogId: string;
  modeloId: string;
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
      model_id: dados.modeloId,
      net_total: total,
      net_assinaturas: dados.assinaturas,
      net_gorjetas: dados.gorjetas,
      net_publicacoes: dados.publicacoes,
      net_mensagens: dados.mensagens,
      net_indicacoes: dados.indicacoes,
      corrigido_manualmente: true,
    },
    { onConflict: 'shift_log_id,model_id' },
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

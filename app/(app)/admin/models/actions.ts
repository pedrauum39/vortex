'use server';

import { revalidatePath } from 'next/cache';
import { ehAdmin, exigirRep } from '@/lib/auth';
import { criarClienteServidor } from '@/lib/supabase/server';
import { dataBRT } from '@/lib/tempo';
import type { Bloco } from '@/lib/tipos';

async function exigirAdmin() {
  const rep = await exigirRep();
  if (!ehAdmin(rep)) throw new Error('Só admin.');
}

function revalidar() {
  revalidatePath('/admin/models');
  revalidatePath('/admin/turnos');
  revalidatePath('/schedule');
  revalidatePath('/turno');
}

/** Fecha o período aberto da modelo, se existir. */
async function fecharPeriodo(
  supabase: Awaited<ReturnType<typeof criarClienteServidor>>,
  modelId: string,
  hoje: string,
) {
  const { error } = await supabase
    .from('model_bloco_periodos')
    .update({ fim: hoje })
    .eq('model_id', modelId)
    .is('fim', null);
  if (error) throw new Error(error.message);
}

/** Abre um período novo pra modelo no bloco dado, a partir de hoje. */
async function abrirPeriodo(
  supabase: Awaited<ReturnType<typeof criarClienteServidor>>,
  modelId: string,
  bloco: Bloco,
  hoje: string,
) {
  const { error } = await supabase
    .from('model_bloco_periodos')
    .insert({ model_id: modelId, bloco, inicio: hoje });
  if (error) throw new Error(error.message);
}

export async function criarModelo(nome: string, bloco: Bloco, extra: boolean) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  const { error } = await supabase.from('models').insert({ nome, bloco, extra });
  if (error) throw new Error(error.message);

  revalidar();
}

/** Troca a modelo pro outro time: fecha o período atual e abre um novo no
 * bloco oposto. Todo o histórico de venda de antes fica atribuído ao time
 * antigo (ver lib/periodos.ts blocoNaData). */
export async function moverTime(id: string) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();
  const hoje = dataBRT();

  const { data: modelo, error: erroBusca } = await supabase
    .from('models')
    .select('bloco')
    .eq('id', id)
    .single();
  if (erroBusca || !modelo) throw new Error('Modelo não encontrada.');

  const novoBloco: Bloco = modelo.bloco === 'I' ? 'II' : 'I';

  await fecharPeriodo(supabase, id, hoje);
  await abrirPeriodo(supabase, id, novoBloco, hoje);

  const { error } = await supabase.from('models').update({ bloco: novoBloco }).eq('id', id);
  if (error) throw new Error(error.message);

  revalidar();
}

/** Sem cadeia de desconto confiável (ex.: Kaylin) — nunca aparece no clock-in
 * normal, só é reportada pela aba "Turno Extra" (ver lib/turnosExtraDb.ts). */
export async function definirExtra(id: string, extra: boolean) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  const { error } = await supabase.from('models').update({ extra }).eq('id', id);
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
  const hoje = dataBRT();

  if (ativa) {
    const { data: aberto } = await supabase
      .from('model_bloco_periodos')
      .select('id')
      .eq('model_id', id)
      .is('fim', null)
      .maybeSingle();
    if (!aberto) {
      const { data: modelo } = await supabase.from('models').select('bloco').eq('id', id).single();
      if (modelo) await abrirPeriodo(supabase, id, modelo.bloco, hoje);
    }
  } else {
    await fecharPeriodo(supabase, id, hoje);
  }

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

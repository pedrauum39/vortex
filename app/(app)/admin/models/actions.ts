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

/** `desde` (opcional, default hoje) deixa abrir o período dela numa data
 *  passada — pra uma modelo que já trabalhou turnos antes de ser cadastrada
 *  aparecer no roster desses turnos antigos em admin/turnos (blocoNaData só
 *  resolve dentro do período; sem isto ela só apareceria dali em diante). */
export async function criarModelo(
  nome: string,
  bloco: Bloco,
  extra: boolean,
  desde?: string,
  metaMensal?: number,
  valorEntrada?: number,
) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  const { data, error } = await supabase
    .from('models')
    .insert({ nome, bloco, extra, meta_mensal: metaMensal || 0, valor_entrada: valorEntrada || 0 })
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  const inicio = desde || dataBRT();
  await abrirPeriodo(supabase, data.id, bloco, inicio);
  const { error: erroMeta } = await supabase
    .from('model_meta_periodos')
    .insert({ model_id: data.id, meta_mensal: metaMensal || 0, inicio });
  if (erroMeta) throw new Error(erroMeta.message);

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

/** Corrige a data de início do período ABERTO da modelo (o que decide desde
 *  quando ela aparece no roster de admin/turnos pra corrigir/lançar turno
 *  antigo — ver blocoNaData em lib/periodos.ts). Não mexe em período já
 *  fechado (histórico de troca de time/desativação continua intocado). */
export async function ajustarInicioPeriodo(id: string, inicio: string) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  const { error } = await supabase
    .from('model_bloco_periodos')
    .update({ inicio })
    .eq('model_id', id)
    .is('fim', null);
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
    const { data: aberto, error: erroAberto } = await supabase
      .from('model_bloco_periodos')
      .select('id')
      .eq('model_id', id)
      .is('fim', null)
      .maybeSingle();
    if (erroAberto) throw new Error(erroAberto.message);
    if (!aberto) {
      const { data: modelo, error: erroBusca } = await supabase.from('models').select('bloco').eq('id', id).single();
      if (erroBusca) throw new Error(erroBusca.message);
      if (modelo) await abrirPeriodo(supabase, id, modelo.bloco, hoje);
    }
  } else {
    await fecharPeriodo(supabase, id, hoje);
  }

  const { error } = await supabase.from('models').update({ ativa }).eq('id', id);
  if (error) throw new Error(error.message);

  revalidar();
}

/** Fecha o período de meta aberto da modelo, se existir. */
async function fecharPeriodoDeMeta(
  supabase: Awaited<ReturnType<typeof criarClienteServidor>>,
  modelId: string,
  hoje: string,
) {
  const { error } = await supabase
    .from('model_meta_periodos')
    .update({ fim: hoje })
    .eq('model_id', modelId)
    .is('fim', null);
  if (error) throw new Error(error.message);
}

/** Muda a meta mensal registrando o histórico (model_meta_periodos) — um mês
 *  passado consultado depois continua mostrando a meta que valia NAQUELE mês
 *  (ex.: 71k em agosto, 61k em setembro), não a atual. A meta é mensal: editar
 *  no meio do mês (ex.: dia 15) vale pro mês INTEIRO, não só dali pra frente —
 *  o período novo começa no dia 1 do mês corrente, não hoje. Sem período
 *  aberto ainda (modelo criada antes desta feature) abre um novo em vez de
 *  fechar. */
export async function definirMetaMensal(id: string, metaMensal: number) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();
  const hoje = dataBRT();
  const inicioDoMes = `${hoje.slice(0, 7)}-01`;

  const [
    { data: modelo, error: erroBusca },
    { data: aberto, error: erroAberto },
  ] = await Promise.all([
    supabase.from('models').select('meta_mensal').eq('id', id).single(),
    supabase.from('model_meta_periodos').select('inicio').eq('model_id', id).is('fim', null).maybeSingle(),
  ]);
  if (erroBusca || !modelo) throw new Error('Modelo não encontrada.');
  if (erroAberto) throw new Error(erroAberto.message);

  if (Number(modelo.meta_mensal) !== metaMensal) {
    // Período novo começa no dia 1 do mês corrente — a não ser que o período
    // aberto tenha começado DEPOIS disso (página nova criada esse mês com
    // "desde" no meio dele), caso em que usa esse início pra não violar
    // fim >= inicio do período que está sendo fechado.
    const novoInicio = aberto && aberto.inicio > inicioDoMes ? aberto.inicio : inicioDoMes;
    await fecharPeriodoDeMeta(supabase, id, novoInicio);
    const { error: erroInsert } = await supabase
      .from('model_meta_periodos')
      .insert({ model_id: id, meta_mensal: metaMensal, inicio: novoInicio });
    if (erroInsert) throw new Error(erroInsert.message);
  }

  const { error } = await supabase.from('models').update({ meta_mensal: metaMensal }).eq('id', id);
  if (error) throw new Error(error.message);

  revalidar();
}

/** Só informativo/visual (ver decisão do usuário) — nunca entra na cadeia de
 *  desconto nem em nenhum cálculo de comissão. */
export async function definirValorEntrada(id: string, valorEntrada: number) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  const { error } = await supabase.from('models').update({ valor_entrada: valorEntrada }).eq('id', id);
  if (error) throw new Error(error.message);

  revalidar();
}

/** shifts.model_id tem ON DELETE SET NULL — apagar não quebra turnos existentes.
 *  statements.model_id e turnos_extra.model_id NÃO têm cascade — página com
 *  venda ou turno extra real registrado bloqueia a exclusão (constraint
 *  23503, foreign key violation) pra não perder histórico financeiro.
 *  Devolve o erro em vez de lançar: o Next apaga a mensagem de exceptions de
 *  Server Action em produção (o admin só veria "An error occurred...", sem
 *  dizer o motivo real). */
export async function apagarModelo(id: string): Promise<{ erro: string | null }> {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  const { error } = await supabase.from('models').delete().eq('id', id);
  if (error) {
    if (error.code === '23503') {
      return {
        erro: 'Não dá pra apagar: essa página já tem venda ou turno extra registrado. Desative-a em vez de apagar.',
      };
    }
    throw new Error(error.message);
  }

  revalidar();
  return { erro: null };
}

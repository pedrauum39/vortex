'use server';

import { revalidatePath } from 'next/cache';
import { ehAdmin, exigirRep } from '@/lib/auth';
import { criarClienteServidor } from '@/lib/supabase/server';
import { brtParaUtc } from '@/lib/tempo';
import type { Bloco, Funcao, Turno } from '@/lib/tipos';
import { apagarTurnoExtra } from '@/lib/turnosExtraDb';

async function exigirAdmin() {
  const rep = await exigirRep();
  if (!ehAdmin(rep)) throw new Error('Só admin.');
  return rep;
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
 *
 * Toda troca de dono (inclusive slot que estava vazio, ou slot esvaziado pra
 * "—") grava uma linha em escala_alteracoes — é o log da aba /admin/turnos.
 */
async function aplicarSlot(
  supabase: Awaited<ReturnType<typeof criarClienteServidor>>,
  slot: Slot,
  alteradoPor: string,
) {
  const { data: existente } = await supabase
    .from('shifts')
    .select('id, rep_id')
    .eq('data', slot.data)
    .eq('turno', slot.turno)
    .eq('bloco', slot.bloco)
    .eq('funcao', slot.funcao)
    .maybeSingle();

  const repAntes = existente?.rep_id ?? null;
  if (repAntes === slot.repId) return;

  if (existente) {
    const { error } = await supabase.from('shifts').delete().eq('id', existente.id);
    if (error) throw new Error(error.message);
  }

  if (slot.repId) {
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

  const { error: erroLog } = await supabase.from('escala_alteracoes').insert({
    data: slot.data,
    turno: slot.turno,
    bloco: slot.bloco,
    funcao: slot.funcao,
    rep_saiu: repAntes,
    rep_entrou: slot.repId,
    alterado_por: alteradoPor,
  });
  if (erroLog) throw new Error(erroLog.message);
}

/**
 * Grava de uma vez todas as células alteradas na grade — o admin edita
 * várias e só um clique em "Salvar alterações" manda tudo junto, em vez de
 * cada troca de select gravar sozinha na hora.
 */
export async function salvarGrade(alteracoes: Slot[]) {
  const rep = await exigirAdmin();
  const supabase = await criarClienteServidor();

  for (const slot of alteracoes) await aplicarSlot(supabase, slot, rep.id);

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

  const entrada = localParaUtc(dados.entrada);
  const saida = dados.saida ? localParaUtc(dados.saida) : null;
  // O banco também trava isso (shift_logs_saida_ordenada), mas sem checar
  // aqui o erro chega cru — um turno T6/T1 vira a noite, então esquecer de
  // avançar a data da saída pro dia seguinte já bateu essa constraint.
  if (saida && saida < entrada) {
    throw new Error(
      'Saída não pode ser antes da entrada. Turno que vira a noite (T6/T1) precisa da saída datada no dia seguinte.',
    );
  }

  const { data: log, error } = await supabase
    .from('shift_logs')
    .upsert(
      {
        shift_id: dados.shiftId,
        rep_id: dados.repId,
        clock_in_at: entrada.toISOString(),
        clock_out_at: saida ? saida.toISOString() : null,
      },
      { onConflict: 'shift_id,rep_id' },
    )
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  // Upsert primeiro, delete só de quem saiu depois — mesmo motivo do
  // trocarModelos() em app/(app)/turno/actions.ts: apagar tudo e reinserir
  // tudo cria uma janela onde uma chamada concorrente/reenviada pode colidir
  // com "duplicate key value violates unique constraint" (bateu de verdade
  // em produção nesse mesmo padrão em /turno).
  const { error: erroUpsertModelos } = await supabase.from('shift_log_models').upsert(
    dados.modeloIds.map((modelId) => ({ shift_log_id: log.id, model_id: modelId })),
    { onConflict: 'shift_log_id,model_id', ignoreDuplicates: true },
  );
  if (erroUpsertModelos) throw new Error(erroUpsertModelos.message);

  const { data: modelosAtuais } = await supabase
    .from('shift_log_models')
    .select('model_id')
    .eq('shift_log_id', log.id);
  const modelosRemovidos = (modelosAtuais ?? [])
    .map((m) => m.model_id as string)
    .filter((id) => !dados.modeloIds.includes(id));

  if (modelosRemovidos.length > 0) {
    const { error: erroModelos } = await supabase
      .from('shift_log_models')
      .delete()
      .eq('shift_log_id', log.id)
      .in('model_id', modelosRemovidos);
    if (erroModelos) throw new Error(erroModelos.message);
  }

  revalidar();
}

/**
 * Adiciona uma modelo ao ponto sem mexer no resto — pra abrir uma statement
 * de uma modelo que faltou, sem precisar reabrir "editar ponto" e reescolher
 * entrada/saída.
 */
export async function adicionarModeloAoPonto(shiftLogId: string, modeloId: string) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  const { error } = await supabase
    .from('shift_log_models')
    .upsert({ shift_log_id: shiftLogId, model_id: modeloId }, { onConflict: 'shift_log_id,model_id' });
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

/** Tira uma modelo do ponto por completo — não só o statement dela, a
 * associação inteira em shift_log_models. Pra quando ela foi marcada por
 * engano, ou (caso real: Kaylin em turnos de antes do "Turno Extra" existir)
 * a cadeia de desconto dela nunca vai resolver e o turno fica "aberto" pra
 * sempre com ela ligada — tirando ela, a comissão fecha só com o resto. */
export async function removerModeloDoPonto(shiftLogId: string, modeloId: string) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  const { error: erroStatement } = await supabase
    .from('statements')
    .delete()
    .eq('shift_log_id', shiftLogId)
    .eq('model_id', modeloId);
  if (erroStatement) throw new Error(erroStatement.message);

  const { error } = await supabase
    .from('shift_log_models')
    .delete()
    .eq('shift_log_id', shiftLogId)
    .eq('model_id', modeloId);
  if (error) throw new Error(error.message);

  revalidar();
}

export async function apagarTurnoExtraAdmin(id: string) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  await apagarTurnoExtra(supabase, id);

  revalidar();
}

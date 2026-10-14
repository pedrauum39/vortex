'use server';

import { revalidatePath } from 'next/cache';
import { ehAdmin, exigirRep } from '@/lib/auth';
import { criarClienteServidor } from '@/lib/supabase/server';
import { brtParaUtc } from '@/lib/tempo';
import { rotuloTurno } from '@/lib/tipos';
import type { Bloco, Funcao, Metade, Turno } from '@/lib/tipos';
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
  /** Desmarcado: o turno não entra na meta da página nem no bônus de
   *  Party/Team addition — só fica disponível como leitura anterior pra
   *  cadeia de desconto (ex.: modelo nova sem T6/T1 registrado antes dela). */
  contaVenda?: boolean;
}) {
  const admin = await exigirAdmin();
  const supabase = await criarClienteServidor();

  const { count: metades } = await supabase
    .from('shifts')
    .select('id', { count: 'exact', head: true })
    .eq('data', dados.data)
    .eq('turno', dados.turno)
    .eq('bloco', dados.bloco)
    .gt('metade', 0);
  if (metades) throw new Error('Esse turno está dividido em metades — edite pela grade da escala.');

  const { data: existente, error: erroBusca } = await supabase
    .from('shifts')
    .select('rep_id')
    .eq('data', dados.data)
    .eq('turno', dados.turno)
    .eq('bloco', dados.bloco)
    .eq('funcao', dados.funcao)
    .eq('metade', 0)
    .maybeSingle();
  if (erroBusca) throw new Error(erroBusca.message);

  const { error } = await supabase.from('shifts').upsert(
    {
      data: dados.data,
      turno: dados.turno,
      bloco: dados.bloco,
      funcao: dados.funcao,
      rep_id: dados.repId,
      origem: 'manual',
      conta_venda: dados.contaVenda ?? true,
    },
    { onConflict: 'data,turno,bloco,funcao,metade' },
  );
  if (error) throw new Error(error.message);

  const repAntes = existente?.rep_id ?? null;
  if (repAntes !== dados.repId) {
    await registrarAlteracao(supabase, {
      data: dados.data,
      turno: dados.turno,
      bloco: dados.bloco,
      funcao: dados.funcao,
      repSaiu: repAntes,
      repEntrou: dados.repId,
      alteradoPor: admin.id,
    });
  }

  revalidar();
}

type Slot = { data: string; turno: Turno; bloco: Bloco; funcao: Funcao; metade: Metade; repId: string | null };

type Alteracao = {
  data: string;
  turno: Turno;
  bloco: Bloco;
  metade?: Metade;
  funcao: Funcao;
  repSaiu: string | null;
  repEntrou: string | null;
  alteradoPor: string;
};

/** Grava uma linha no log da aba /admin/turnos. Todo controle que muda quem
 *  ocupa um slot da grade passa por aqui. */
async function registrarAlteracao(
  supabase: Awaited<ReturnType<typeof criarClienteServidor>>,
  a: Alteracao,
) {
  const { error } = await supabase.from('escala_alteracoes').insert({
    data: a.data,
    turno: a.turno,
    bloco: a.bloco,
    metade: a.metade ?? 0,
    funcao: a.funcao,
    rep_saiu: a.repSaiu,
    rep_entrou: a.repEntrou,
    alterado_por: a.alteradoPor,
  });
  if (error) throw new Error(error.message);
}

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
  const { data: existente, error: erroBusca } = await supabase
    .from('shifts')
    .select('id, rep_id')
    .eq('data', slot.data)
    .eq('turno', slot.turno)
    .eq('bloco', slot.bloco)
    .eq('funcao', slot.funcao)
    .eq('metade', slot.metade)
    .maybeSingle();
  if (erroBusca) throw new Error(erroBusca.message);

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
      metade: slot.metade,
      rep_id: slot.repId,
      origem: 'manual',
    });
    if (error) throw new Error(error.message);
  }

  await registrarAlteracao(supabase, {
    data: slot.data,
    turno: slot.turno,
    bloco: slot.bloco,
    metade: slot.metade,
    funcao: slot.funcao,
    repSaiu: repAntes,
    repEntrou: slot.repId,
    alteradoPor: alteradoPor,
  });
}

/**
 * Grava de uma vez todas as células alteradas na grade — o admin edita
 * várias e só um clique em "Salvar alterações" manda tudo junto, em vez de
 * cada troca de select gravar sozinha na hora.
 */
export async function salvarGrade(alteracoes: Slot[]) {
  const rep = await exigirAdmin();
  const supabase = await criarClienteServidor();

  try {
    for (const slot of alteracoes) await aplicarSlot(supabase, slot, rep.id);
  } finally {
    revalidar();
  }
}

type LinhaDoSlot = { id: string; funcao: Funcao; metade: Metade; rep_id: string | null; shift_logs: { id: string }[] };

async function linhasDoSlot(
  supabase: Awaited<ReturnType<typeof criarClienteServidor>>,
  data: string,
  turno: Turno,
  bloco: Bloco,
): Promise<LinhaDoSlot[]> {
  const { data: linhas, error } = await supabase
    .from('shifts')
    .select('id, funcao, metade, rep_id, shift_logs(id)')
    .eq('data', data)
    .eq('turno', turno)
    .eq('bloco', bloco);
  if (error) throw new Error(error.message);
  return (linhas ?? []) as LinhaDoSlot[];
}

/**
 * Divide o turno do dia em duas metades de 4h (ex.: T6 | T1) — pra quando
 * alguém sai no meio e outro assume. A linha do turno inteiro vira a 1ª
 * metade (um UPDATE, não apaga e recria: quem já bateu ponto nela continua
 * com o ponto e o print) e ganha uma cópia como 2ª metade, com o mesmo rep,
 * pro admin trocar quem precisar.
 */
export async function dividirTurno(data: string, turno: Turno, bloco: Bloco) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  const linhas = await linhasDoSlot(supabase, data, turno, bloco);
  if (linhas.some((l) => l.metade > 0)) throw new Error('Esse turno já está dividido.');
  if (!linhas.some((l) => l.funcao === 'regular')) {
    throw new Error('Escale alguém no turno antes de dividir.');
  }

  for (const l of linhas) {
    const { error: erroUpdate } = await supabase.from('shifts').update({ metade: 1 }).eq('id', l.id);
    if (erroUpdate) throw new Error(erroUpdate.message);

    const { error: erroInsert } = await supabase.from('shifts').insert({
      data,
      turno,
      bloco,
      funcao: l.funcao,
      metade: 2,
      rep_id: l.rep_id,
      origem: 'manual',
    });
    if (erroInsert) throw new Error(erroInsert.message);
  }

  revalidar();
}

/**
 * Desfaz a divisão: volta a um turno inteiro só. Por função (regular/assist),
 * fica a linha da 1ª metade (ou a da 2ª, se a 1ª não existir). Recusa se a
 * linha que seria descartada já tem ponto batido — juntar apagaria o ponto e
 * o print dela.
 */
export async function juntarTurno(data: string, turno: Turno, bloco: Bloco) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  const linhas = (await linhasDoSlot(supabase, data, turno, bloco)).filter((l) => l.metade > 0);

  for (const funcao of ['regular', 'assist'] as Funcao[]) {
    const primeira = linhas.find((l) => l.funcao === funcao && l.metade === 1);
    const segunda = linhas.find((l) => l.funcao === funcao && l.metade === 2);
    if (primeira && segunda?.shift_logs.length) {
      throw new Error(
        `A ${rotuloTurno(turno, 2)} já tem ponto batido${funcao === 'assist' ? ' (Assistant)' : ''} — apague o ponto dela antes de juntar.`,
      );
    }
  }

  for (const funcao of ['regular', 'assist'] as Funcao[]) {
    const primeira = linhas.find((l) => l.funcao === funcao && l.metade === 1);
    const segunda = linhas.find((l) => l.funcao === funcao && l.metade === 2);
    const fica = primeira ?? segunda;
    if (!fica) continue;

    if (primeira && segunda) {
      const { error } = await supabase.from('shifts').delete().eq('id', segunda.id);
      if (error) throw new Error(error.message);
    }
    const { error } = await supabase.from('shifts').update({ metade: 0 }).eq('id', fica.id);
    if (error) throw new Error(error.message);
  }

  revalidar();
}

/** Apaga o turno. Em cascata some o ponto e os statements que estivessem nele. */
export async function apagarTurno(shiftId: string) {
  const admin = await exigirAdmin();
  const supabase = await criarClienteServidor();

  const { data: alvo, error: erroBusca } = await supabase
    .from('shifts')
    .select('data, turno, bloco, metade, funcao, rep_id')
    .eq('id', shiftId)
    .maybeSingle();
  if (erroBusca) throw new Error(erroBusca.message);

  const { error } = await supabase.from('shifts').delete().eq('id', shiftId);
  if (error) throw new Error(error.message);

  if (alvo?.rep_id) {
    await registrarAlteracao(supabase, {
      data: alvo.data,
      turno: alvo.turno as Turno,
      bloco: alvo.bloco as Bloco,
      metade: alvo.metade as Metade,
      funcao: alvo.funcao as Funcao,
      repSaiu: alvo.rep_id,
      repEntrou: null,
      alteradoPor: admin.id,
    });
  }

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

/**
 * Leitura filler: o print de uma modelo num turno que ninguém do time
 * trabalhou (modelo nova). Só base pro desconto do turno seguinte — ver
 * buscarAnterior() e supabase/migrations/0036_leituras_filler.sql.
 */
export async function lancarLeituraFiller(dados: {
  modeloId: string;
  data: string;
  turno: Turno;
  assinaturas: number;
  gorjetas: number;
  publicacoes: number;
  mensagens: number;
  indicacoes: number;
}) {
  const admin = await exigirAdmin();
  const supabase = await criarClienteServidor();

  const { error } = await supabase.from('leituras_filler').upsert(
    {
      model_id: dados.modeloId,
      data: dados.data,
      turno: dados.turno,
      net_assinaturas: dados.assinaturas,
      net_gorjetas: dados.gorjetas,
      net_publicacoes: dados.publicacoes,
      net_mensagens: dados.mensagens,
      net_indicacoes: dados.indicacoes,
      criado_por: admin.id,
    },
    { onConflict: 'model_id,data,turno' },
  );
  if (error) throw new Error(error.message);

  revalidar();
}

export async function apagarLeituraFiller(id: string) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  const { error } = await supabase.from('leituras_filler').delete().eq('id', id);
  if (error) throw new Error(error.message);

  revalidar();
}

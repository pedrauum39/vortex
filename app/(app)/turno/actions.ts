'use server';

import { revalidatePath } from 'next/cache';
import { exigirRep } from '@/lib/auth';
import type { LinhasNet } from '@/lib/statement';
import { buscarAnterior, type Anterior } from '@/lib/statementDb';
import { criarClienteAdmin, criarClienteServidor } from '@/lib/supabase/server';
import type { Turno } from '@/lib/tipos';
import { MINUTOS_DE_ANTECEDENCIA, podeIniciar } from '@/lib/turno';

export type { Anterior };

function revalidar() {
  revalidatePath('/turno');
  revalidatePath('/');
}

/** Clock in com 1 ou 2 modelos (double). `clock_in_at` vem do default now() do Postgres. */
export async function iniciarTurno(shiftId: string, modeloIds: string[]) {
  const rep = await exigirRep();
  const supabase = await criarClienteServidor();

  if (modeloIds.length === 0) throw new Error('Escolha ao menos uma modelo.');
  if (modeloIds.length > 2) throw new Error('No máximo duas modelos (double).');

  // A trava vale no servidor, não só no botão: a tela pode estar aberta desde
  // antes da janela abrir, ou a ação pode ser chamada direto. Admin ignora a
  // janela — precisa poder testar o fluxo (OCR, comissão) a qualquer hora.
  const { data: shift } = await supabase
    .from('shifts')
    .select('data, turno')
    .eq('id', shiftId)
    .eq('rep_id', rep.id)
    .single();
  if (!shift) throw new Error('Turno não encontrado.');

  if (rep.role !== 'admin' && !podeIniciar(shift.turno as Turno, shift.data as string)) {
    throw new Error(
      `O ponto abre ${MINUTOS_DE_ANTECEDENCIA} minutos antes do turno e fecha quando ele termina.`,
    );
  }

  const { data: log, error } = await supabase
    .from('shift_logs')
    .insert({ shift_id: shiftId, rep_id: rep.id })
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  const { error: erroModelos } = await supabase
    .from('shift_log_models')
    .insert(modeloIds.map((modelId) => ({ shift_log_id: log.id, model_id: modelId })));
  if (erroModelos) throw new Error(erroModelos.message);

  revalidar();
}

/** Substitui a lista de modelos deste turno — o rep corrigindo uma escolha errada. */
export async function trocarModelos(logId: string, modeloIds: string[]) {
  await exigirRep();
  const supabase = await criarClienteServidor();

  if (modeloIds.length === 0) throw new Error('Escolha ao menos uma modelo.');
  if (modeloIds.length > 2) throw new Error('No máximo duas modelos (double).');

  const { error: erroDelete } = await supabase
    .from('shift_log_models')
    .delete()
    .eq('shift_log_id', logId);
  if (erroDelete) throw new Error(erroDelete.message);

  const { error } = await supabase
    .from('shift_log_models')
    .insert(modeloIds.map((modelId) => ({ shift_log_id: logId, model_id: modelId })));
  if (error) throw new Error(error.message);

  revalidar();
}

/**
 * As linhas net do statement da MESMA modelo no turno anterior da cadeia.
 * Atravessa o RLS de propósito: o turno anterior pode ser de OUTRO rep. O que
 * volta são só os valores acumulados que já estão embutidos no print que este
 * rep tem na mão — nenhum nome, nenhuma hora, nenhuma comissão.
 */
export async function statementAnterior(shiftId: string, modeloId: string): Promise<Anterior> {
  await exigirRep();
  const supabase = await criarClienteServidor();

  // O RLS garante que o rep só alcança o próprio turno.
  const { data: meu } = await supabase
    .from('shifts')
    .select('data, turno')
    .eq('id', shiftId)
    .single();
  if (!meu) throw new Error('Turno não encontrado.');

  return buscarAnterior(criarClienteAdmin(), meu.turno as Turno, meu.data as string, modeloId);
}

export type ReportModelo = {
  modeloId: string;
  linhas: LinhasNet;
  netTotal: number;
  imagemPath: string | null;
  ocrRaw: unknown;
  corrigidoManualmente: boolean;
  refundConfirmado: boolean;
};

export type DadosReport = {
  reports: ReportModelo[];
  resumo: string;
  teveAssistente: boolean;
  saiuAntes: boolean;
  motivoSaida: string | null;
};

/** Fecha o turno e grava um statement por modelo trabalhada. */
export async function finalizarTurno(logId: string, dados: DadosReport) {
  await exigirRep();
  const supabase = await criarClienteServidor();

  if (dados.reports.length === 0) throw new Error('Falta o report de ao menos uma modelo.');

  const { error: erroStatements } = await supabase.from('statements').upsert(
    dados.reports.map((r) => ({
      shift_log_id: logId,
      model_id: r.modeloId,
      imagem_path: r.imagemPath,
      ocr_raw: r.ocrRaw,
      net_total: r.netTotal,
      net_assinaturas: r.linhas.assinaturas,
      net_gorjetas: r.linhas.gorjetas,
      net_publicacoes: r.linhas.publicacoes,
      net_mensagens: r.linhas.mensagens,
      net_indicacoes: r.linhas.indicacoes,
      corrigido_manualmente: r.corrigidoManualmente,
      refund_confirmado: r.refundConfirmado,
    })),
    { onConflict: 'shift_log_id,model_id' },
  );
  if (erroStatements) throw new Error(erroStatements.message);

  // O statement pode falhar sem derrubar o turno, mas o clock out não: é ele
  // que fecha as horas.
  const { error } = await supabase
    .from('shift_logs')
    .update({
      clock_out_at: new Date().toISOString(),
      resumo: dados.resumo || null,
      teve_assistente: dados.teveAssistente,
      saiu_antes: dados.saiuAntes,
      motivo_saida: dados.saiuAntes ? dados.motivoSaida : null,
    })
    .eq('id', logId);
  if (error) throw new Error(error.message);

  revalidar();
}

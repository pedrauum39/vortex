'use server';

import { revalidatePath } from 'next/cache';
import { exigirRep } from '@/lib/auth';
import type { LinhasNet } from '@/lib/statement';
import { turnoAnterior } from '@/lib/statement';
import { criarClienteAdmin, criarClienteServidor } from '@/lib/supabase/server';
import type { Turno } from '@/lib/tipos';
import { MINUTOS_DE_ANTECEDENCIA, podeIniciar } from '@/lib/turno';

function revalidar() {
  revalidatePath('/turno');
  revalidatePath('/');
}

/** Clock in. `clock_in_at` vem do default now() do Postgres, em UTC. */
export async function iniciarTurno(shiftId: string, modelIdReal: string | null) {
  const rep = await exigirRep();
  const supabase = await criarClienteServidor();

  // A trava vale no servidor, não só no botão: a tela pode estar aberta desde
  // antes da janela abrir, ou a ação pode ser chamada direto.
  const { data: shift } = await supabase
    .from('shifts')
    .select('data, turno')
    .eq('id', shiftId)
    .eq('rep_id', rep.id)
    .single();
  if (!shift) throw new Error('Turno não encontrado.');

  if (!podeIniciar(shift.turno as Turno, shift.data as string)) {
    throw new Error(
      `O ponto abre ${MINUTOS_DE_ANTECEDENCIA} minutos antes do turno e fecha quando ele termina.`,
    );
  }

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

/**
 * `primeiro` abre o dia e vale o statement inteiro. `pendente` é o turno
 * anterior que ainda não mandou o print — descontar zero aí inflaria o valor
 * deste turno, então o cálculo fica em aberto até o print chegar.
 */
export type Anterior =
  | { tipo: 'primeiro' }
  | { tipo: 'pendente' }
  | { tipo: 'ok'; linhas: LinhasNet };

/**
 * As linhas net do statement do turno anterior na cadeia do dia, para descontar
 * do acumulado deste turno.
 *
 * Atravessa o RLS de propósito: o turno anterior é de OUTRO rep. O que volta
 * são só os valores acumulados que já estão embutidos no print que este rep tem
 * na mão — nenhum nome, nenhuma hora, nenhuma comissão.
 */
export async function statementAnterior(shiftId: string): Promise<Anterior> {
  await exigirRep();
  const supabase = await criarClienteServidor();

  // O RLS garante que o rep só alcança o próprio turno.
  const { data: meu } = await supabase
    .from('shifts')
    .select('data, turno, model_id, shift_logs(model_id_real)')
    .eq('id', shiftId)
    .single();
  if (!meu) throw new Error('Turno não encontrado.');

  const anterior = turnoAnterior(meu.turno as Turno, meu.data as string);
  if (!anterior) return { tipo: 'primeiro' };

  const logs = meu.shift_logs as { model_id_real: string | null }[];
  const minhaModelo = logs[0]?.model_id_real ?? (meu.model_id as string | null);

  const { data: candidatos } = await criarClienteAdmin()
    .from('shifts')
    .select(
      'model_id, shift_logs(model_id_real, statements(net_assinaturas, net_gorjetas, net_publicacoes, net_mensagens, net_indicacoes))',
    )
    .eq('data', anterior.data)
    .eq('turno', anterior.turno)
    .eq('funcao', 'regular');

  for (const turno of candidatos ?? []) {
    // `shift_logs` é lista (vários reps podem logar no mesmo shift), mas
    // `statements` volta como OBJETO: o unique(shift_log_id) faz o PostgREST
    // tratar como um-para-um. Tratar como lista devolveria sempre 'pendente'.
    const log = (
      turno.shift_logs as { model_id_real: string | null; statements: unknown }[]
    )[0];
    const modelo = log?.model_id_real ?? turno.model_id;
    if (modelo !== minhaModelo) continue;

    const st = log?.statements as Record<string, number> | null;
    if (!st) return { tipo: 'pendente' };

    return {
      tipo: 'ok',
      linhas: {
        assinaturas: Number(st.net_assinaturas),
        gorjetas: Number(st.net_gorjetas),
        publicacoes: Number(st.net_publicacoes),
        mensagens: Number(st.net_mensagens),
        indicacoes: Number(st.net_indicacoes),
      },
    };
  }

  // Nenhum turno da mesma modelo antes deste — ninguém trabalhou ou o print
  // ainda não veio. Nos dois casos o desconto fica em aberto.
  return { tipo: 'pendente' };
}

export type DadosReport = {
  linhas: LinhasNet;
  netTotal: number;
  resumo: string;
  teveAssistente: boolean;
  saiuAntes: boolean;
  motivoSaida: string | null;
  imagemPath: string | null;
  ocrRaw: unknown;
  corrigidoManualmente: boolean;
  refundConfirmado: boolean;
};

/** Fecha o turno e grava o statement. */
export async function finalizarTurno(logId: string, dados: DadosReport) {
  await exigirRep();
  const supabase = await criarClienteServidor();

  const { error: erroStatement } = await supabase.from('statements').upsert(
    {
      shift_log_id: logId,
      imagem_path: dados.imagemPath,
      ocr_raw: dados.ocrRaw,
      net_total: dados.netTotal,
      net_assinaturas: dados.linhas.assinaturas,
      net_gorjetas: dados.linhas.gorjetas,
      net_publicacoes: dados.linhas.publicacoes,
      net_mensagens: dados.linhas.mensagens,
      net_indicacoes: dados.linhas.indicacoes,
      corrigido_manualmente: dados.corrigidoManualmente,
      refund_confirmado: dados.refundConfirmado,
    },
    { onConflict: 'shift_log_id' },
  );
  if (erroStatement) throw new Error(erroStatement.message);

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

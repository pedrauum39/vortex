// Busca do statement anterior na cadeia, contra o banco. Compartilhado entre a
// tela do turno, o invoice e o admin — todos precisam da mesma regra de "quem
// vem antes na cadeia do dia", agora por modelo: um turno "double" tem um
// statement por modelo, e cada modelo tem sua própria cadeia.

import type { SupabaseClient } from '@supabase/supabase-js';
import { turnoAnterior, type LinhasNet } from './statement';
import type { Turno } from './tipos';

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
 * As linhas net do statement da MESMA modelo no turno anterior da cadeia.
 * Espera um cliente que atravesse o RLS (admin) — o turno anterior pode ser de
 * outro rep, e o que volta são só os valores acumulados do print dele.
 */
export async function buscarAnterior(
  db: SupabaseClient,
  turno: Turno,
  data: string,
  modeloId: string,
): Promise<Anterior> {
  const anterior = turnoAnterior(turno, data);
  if (!anterior) return { tipo: 'primeiro' };

  // Os turnos 'regular' do dia anterior — pode ter mais de um bloco; o que
  // importa é qual shift_log tem statement para ESTA modelo.
  const { data: shiftsAnteriores } = await db
    .from('shifts')
    .select('shift_logs(id)')
    .eq('data', anterior.data)
    .eq('turno', anterior.turno)
    .eq('funcao', 'regular');

  const logIds = (shiftsAnteriores ?? []).flatMap((s) =>
    (s.shift_logs as { id: string }[]).map((l) => l.id),
  );
  if (logIds.length === 0) return { tipo: 'pendente' };

  const { data: st } = await db
    .from('statements')
    .select('net_assinaturas, net_gorjetas, net_publicacoes, net_mensagens, net_indicacoes')
    .in('shift_log_id', logIds)
    .eq('model_id', modeloId)
    .maybeSingle();

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

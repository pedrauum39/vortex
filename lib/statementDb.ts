// Busca do statement anterior na cadeia, contra o banco. Compartilhado entre a
// tela do turno (um shift por vez) e o invoice (vários shifts de uma vez) —
// as duas precisam da mesma regra de "quem vem antes na cadeia do dia".

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
 * As linhas net do statement do turno anterior na cadeia do dia, para a mesma
 * modelo. Espera um cliente que atravesse o RLS (admin) — o turno anterior é
 * de OUTRO rep, e o que volta são só os valores acumulados do print dele.
 */
export async function buscarAnterior(
  db: SupabaseClient,
  turno: Turno,
  data: string,
  minhaModelo: string | null,
): Promise<Anterior> {
  const anterior = turnoAnterior(turno, data);
  if (!anterior) return { tipo: 'primeiro' };

  const { data: candidatos } = await db
    .from('shifts')
    .select(
      'model_id, shift_logs(model_id_real, statements(net_assinaturas, net_gorjetas, net_publicacoes, net_mensagens, net_indicacoes))',
    )
    .eq('data', anterior.data)
    .eq('turno', anterior.turno)
    .eq('funcao', 'regular');

  for (const turnoRow of candidatos ?? []) {
    // `shift_logs` é lista (vários reps podem logar no mesmo shift), mas
    // `statements` volta como OBJETO: o unique(shift_log_id) faz o PostgREST
    // tratar como um-para-um. Tratar como lista devolveria sempre 'pendente'.
    const log = (
      turnoRow.shift_logs as { model_id_real: string | null; statements: unknown }[]
    )[0];
    const modelo = log?.model_id_real ?? turnoRow.model_id;
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

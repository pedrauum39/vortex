// Busca do statement anterior na cadeia, contra o banco. Compartilhado entre a
// tela do turno, o invoice e o admin — todos precisam da mesma regra de "quem
// vem antes na cadeia do dia", agora por modelo: um turno "double" tem um
// statement por modelo, e cada modelo tem sua própria cadeia.

import type { SupabaseClient } from '@supabase/supabase-js';
import { turnoAnterior, type LinhasNet } from './statement';
import type { Metade, Turno } from './tipos';

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
 *
 * Turno dividido: a 2ª metade desconta o print da troca (1ª metade do mesmo
 * turno); a 1ª metade desconta o turno anterior normalmente; e o turno
 * seguinte a um dividido desconta a 2ª metade dele, nunca a 1ª.
 */
export async function buscarAnterior(
  db: SupabaseClient,
  turno: Turno,
  data: string,
  modeloId: string,
  metade: Metade = 0,
): Promise<Anterior> {
  const anterior = metade === 2 ? { turno, data } : turnoAnterior(turno, data);
  if (!anterior) return { tipo: 'primeiro' };
  const metadesAnteriores = metade === 2 ? [1] : [0, 2];

  // Os turnos 'regular' do dia anterior — pode ter mais de um bloco; o que
  // importa é qual shift_log tem statement para ESTA modelo.
  const { data: shiftsAnteriores } = await db
    .from('shifts')
    .select('shift_logs(id)')
    .eq('data', anterior.data)
    .eq('turno', anterior.turno)
    .eq('funcao', 'regular')
    .in('metade', metadesAnteriores);

  const logIds = (shiftsAnteriores ?? []).flatMap((s) =>
    (s.shift_logs as { id: string }[]).map((l) => l.id),
  );

  const { data: st } =
    logIds.length === 0
      ? { data: null }
      : await db
          .from('statements')
          .select('net_assinaturas, net_gorjetas, net_publicacoes, net_mensagens, net_indicacoes')
          .in('shift_log_id', logIds)
          .eq('model_id', modeloId)
          .maybeSingle();

  // Sem statement de verdade: pode ser modelo nova, com o print do turno
  // anterior lançado como leitura filler (não é venda de ninguém).
  const linha =
    st ??
    (metade === 2
      ? null
      : (
          await db
            .from('leituras_filler')
            .select('net_assinaturas, net_gorjetas, net_publicacoes, net_mensagens, net_indicacoes')
            .eq('data', anterior.data)
            .eq('turno', anterior.turno)
            .eq('model_id', modeloId)
            .maybeSingle()
        ).data);

  if (!linha) return { tipo: 'pendente' };

  return {
    tipo: 'ok',
    linhas: {
      assinaturas: Number(linha.net_assinaturas),
      gorjetas: Number(linha.net_gorjetas),
      publicacoes: Number(linha.net_publicacoes),
      mensagens: Number(linha.net_mensagens),
      indicacoes: Number(linha.net_indicacoes),
    },
  };
}

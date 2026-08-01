// Monta os SlotResolvido do rep para o período, prontos para lib/invoice.ts.
//
// Um slot pode ter até duas pessoas: quem é regular e, quando a escala (ou uma
// cobertura) escalou alguém no campo Assistant do mesmo dia/turno/bloco, quem
// assistiu. O rep pode aparecer num período tanto como regular quanto como
// assistente, em slots diferentes — por isso duas buscas separadas.

import { buscarAnterior } from '@/lib/statementDb';
import { criarClienteAdmin } from '@/lib/supabase/server';
import type { LinhasNet } from '@/lib/statement';
import type { SlotResolvido } from '@/lib/invoice';
import type { Bloco, Cargo, Turno } from '@/lib/tipos';

type LinhaShift = {
  id: string;
  data: string;
  turno: Turno;
  bloco: Bloco;
  model_id: string | null;
  shift_logs: {
    clock_in_at: string;
    clock_out_at: string | null;
    model_id_real: string | null;
    statements: Record<string, number> | null;
  }[];
};

type LinhaSiblingRegular = {
  rep_id: string | null;
  model_id: string | null;
  reps: { cargo: Cargo; valor_hora: number } | null;
  shift_logs: {
    clock_in_at: string;
    clock_out_at: string | null;
    model_id_real: string | null;
    statements: Record<string, number> | null;
  }[];
};

const paraLinhasNet = (st: Record<string, number>): LinhasNet => ({
  assinaturas: Number(st.net_assinaturas),
  gorjetas: Number(st.net_gorjetas),
  publicacoes: Number(st.net_publicacoes),
  mensagens: Number(st.net_mensagens),
  indicacoes: Number(st.net_indicacoes),
});

export async function buscarSlotsDoRep(
  repId: string,
  cargo: Cargo,
  valorHora: number,
  inicio: string,
  fim: string,
): Promise<SlotResolvido[]> {
  const db = criarClienteAdmin();
  const CAMPOS =
    'id, data, turno, bloco, model_id, shift_logs(clock_in_at, clock_out_at, model_id_real, statements(net_assinaturas, net_gorjetas, net_publicacoes, net_mensagens, net_indicacoes))';

  const [{ data: comoRegular }, { data: comoAssist }] = await Promise.all([
    db
      .from('shifts')
      .select(CAMPOS)
      .eq('rep_id', repId)
      .eq('funcao', 'regular')
      .gte('data', inicio)
      .lte('data', fim),
    db
      .from('shifts')
      .select(CAMPOS)
      .eq('rep_id', repId)
      .eq('funcao', 'assist')
      .gte('data', inicio)
      .lte('data', fim),
  ]);

  const slots: SlotResolvido[] = [];

  // Slots onde EU sou o regular: busco quem me assistiu, se alguém assistiu.
  for (const shift of (comoRegular ?? []) as unknown as LinhaShift[]) {
    const log = shift.shift_logs[0];
    if (!log) continue; // ainda não bati o ponto neste slot

    const minhaModelo = log.model_id_real ?? shift.model_id;
    const anterior = await buscarAnterior(db, shift.turno, shift.data, minhaModelo);

    const { data: siblingRows } = await db
      .from('shifts')
      .select('rep_id, model_id, reps(cargo, valor_hora), shift_logs(clock_in_at, clock_out_at, model_id_real, statements(net_assinaturas, net_gorjetas, net_publicacoes, net_mensagens, net_indicacoes))')
      .eq('data', shift.data)
      .eq('turno', shift.turno)
      .eq('bloco', shift.bloco)
      .eq('funcao', 'assist');
    const sibling = (siblingRows as unknown as LinhaSiblingRegular[] | null)?.[0];
    const assistLog = sibling?.shift_logs[0];

    slots.push({
      data: shift.data,
      turno: shift.turno,
      bloco: shift.bloco,
      regular: {
        repId,
        cargo,
        valorHora,
        clockIn: new Date(log.clock_in_at),
        clockOut: log.clock_out_at ? new Date(log.clock_out_at) : null,
        statement: log.statements ? paraLinhasNet(log.statements) : null,
        anterior: anterior.tipo === 'ok' ? anterior.linhas : null,
        anteriorPendente: anterior.tipo === 'pendente',
      },
      assist:
        sibling?.rep_id && assistLog
          ? {
              repId: sibling.rep_id,
              cargo: sibling.reps?.cargo ?? 'tertius',
              valorHora: sibling.reps?.valor_hora ?? 0,
              clockIn: new Date(assistLog.clock_in_at),
              clockOut: assistLog.clock_out_at ? new Date(assistLog.clock_out_at) : null,
            }
          : null,
    });
  }

  // Slots onde EU sou o assistente: preciso da venda de quem eu assisti.
  for (const shift of (comoAssist ?? []) as unknown as LinhaShift[]) {
    const meuLog = shift.shift_logs[0];
    if (!meuLog) continue;

    const { data: siblingRows } = await db
      .from('shifts')
      .select('rep_id, model_id, reps(cargo, valor_hora), shift_logs(clock_in_at, clock_out_at, model_id_real, statements(net_assinaturas, net_gorjetas, net_publicacoes, net_mensagens, net_indicacoes))')
      .eq('data', shift.data)
      .eq('turno', shift.turno)
      .eq('bloco', shift.bloco)
      .eq('funcao', 'regular');
    const sibling = (siblingRows as unknown as LinhaSiblingRegular[] | null)?.[0];
    const regularLog = sibling?.shift_logs[0];
    if (!sibling?.rep_id || !regularLog) continue; // o regular ainda não bateu ponto

    const modeloRegular = regularLog.model_id_real ?? sibling.model_id;
    const anterior = await buscarAnterior(db, shift.turno, shift.data, modeloRegular);

    slots.push({
      data: shift.data,
      turno: shift.turno,
      bloco: shift.bloco,
      regular: {
        repId: sibling.rep_id,
        cargo: sibling.reps?.cargo ?? 'tertius',
        valorHora: sibling.reps?.valor_hora ?? 0,
        clockIn: new Date(regularLog.clock_in_at),
        clockOut: regularLog.clock_out_at ? new Date(regularLog.clock_out_at) : null,
        statement: regularLog.statements ? paraLinhasNet(regularLog.statements) : null,
        anterior: anterior.tipo === 'ok' ? anterior.linhas : null,
        anteriorPendente: anterior.tipo === 'pendente',
      },
      assist: {
        repId,
        cargo,
        valorHora,
        clockIn: new Date(meuLog.clock_in_at),
        clockOut: meuLog.clock_out_at ? new Date(meuLog.clock_out_at) : null,
      },
    });
  }

  return slots;
}

// Monta os SlotResolvido do rep para o período, prontos para lib/invoice.ts.
//
// Um slot pode ter até duas pessoas: quem é regular e, quando a escala (ou uma
// cobertura) escalou alguém no campo Assistant do mesmo dia/turno/bloco, quem
// assistiu. O rep pode aparecer num período tanto como regular quanto como
// assistente, em slots diferentes — por isso duas buscas separadas. Um regular
// pode ter trabalhado 1 ou 2 modelos (double) no mesmo turno.

import { diaDoStatement } from '@/lib/statement';
import { buscarAnterior } from '@/lib/statementDb';
import { criarClienteAdmin } from '@/lib/supabase/server';
import type { ModeloTrabalhada, SlotResolvido } from '@/lib/invoice';
import { somarDias } from '@/lib/tempo';
import type { Bloco, Cargo, Turno } from '@/lib/tipos';

/** T6T1 cruza a meia-noite e conta pro dia seguinte no statement (diaDoStatement)
 * — um T6T1 datado 31/07 pertence a agosto, não julho. Sem isto ele some do
 * invoice de agosto e aparece indevidamente no de julho. */
function dentroDoPeriodo(turno: Turno, data: string, inicio: string, fim: string): boolean {
  const dia = diaDoStatement(turno, data);
  return dia >= inicio && dia <= fim;
}

type LinhaShift = {
  id: string;
  data: string;
  turno: Turno;
  bloco: Bloco;
  shift_logs: {
    clock_in_at: string;
    clock_out_at: string | null;
    saiu_antes: boolean;
    shift_log_models: { model_id: string }[];
    statements: { model_id: string; net_assinaturas: number; net_gorjetas: number; net_publicacoes: number; net_mensagens: number; net_indicacoes: number }[];
  }[];
};

type LinhaSiblingRegular = {
  rep_id: string | null;
  reps: { cargo: Cargo; valor_hora: number } | null;
  shift_logs: {
    clock_in_at: string;
    clock_out_at: string | null;
    saiu_antes: boolean;
    shift_log_models: { model_id: string }[];
    statements: { model_id: string; net_assinaturas: number; net_gorjetas: number; net_publicacoes: number; net_mensagens: number; net_indicacoes: number }[];
  }[];
};

const CAMPOS =
  'id, data, turno, bloco, shift_logs(clock_in_at, clock_out_at, saiu_antes, shift_log_models(model_id), statements(model_id, net_assinaturas, net_gorjetas, net_publicacoes, net_mensagens, net_indicacoes))';

async function montarModelos(
  db: ReturnType<typeof criarClienteAdmin>,
  turno: Turno,
  data: string,
  log: LinhaShift['shift_logs'][number],
): Promise<ModeloTrabalhada[]> {
  const modelos: ModeloTrabalhada[] = [];

  for (const { model_id } of log.shift_log_models) {
    const statement = log.statements.find((s) => s.model_id === model_id) ?? null;
    const anterior = await buscarAnterior(db, turno, data, model_id);

    modelos.push({
      modeloId: model_id,
      statement: statement
        ? {
            assinaturas: Number(statement.net_assinaturas),
            gorjetas: Number(statement.net_gorjetas),
            publicacoes: Number(statement.net_publicacoes),
            mensagens: Number(statement.net_mensagens),
            indicacoes: Number(statement.net_indicacoes),
          }
        : null,
      anterior: anterior.tipo === 'ok' ? anterior.linhas : null,
      anteriorPendente: anterior.tipo === 'pendente',
    });
  }

  return modelos;
}

export async function buscarSlotsDoRep(
  repId: string,
  cargo: Cargo,
  valorHora: number,
  inicio: string,
  fim: string,
): Promise<SlotResolvido[]> {
  const db = criarClienteAdmin();

  // Busca desde um dia antes: um T6T1 do último dia do mês anterior pode
  // pertencer a este período (diaDoStatement), mas sua `data` fica fora da
  // janela crua — a checagem de dentroDoPeriodo() filtra certo depois.
  const inicioBusca = somarDias(inicio, -1);

  const [{ data: comoRegular }, { data: comoAssist }] = await Promise.all([
    db
      .from('shifts')
      .select(CAMPOS)
      .eq('rep_id', repId)
      .eq('funcao', 'regular')
      .gte('data', inicioBusca)
      .lte('data', fim),
    db
      .from('shifts')
      .select(CAMPOS)
      .eq('rep_id', repId)
      .eq('funcao', 'assist')
      .gte('data', inicioBusca)
      .lte('data', fim),
  ]);

  const slots: SlotResolvido[] = [];

  // Slots onde EU sou o regular: busco quem me assistiu, se alguém assistiu.
  for (const shift of (comoRegular ?? []) as unknown as LinhaShift[]) {
    if (!dentroDoPeriodo(shift.turno, shift.data, inicio, fim)) continue;
    const log = shift.shift_logs[0];
    if (!log) continue; // ainda não bati o ponto neste slot

    const { data: siblingRows } = await db
      .from('shifts')
      .select(
        'rep_id, reps(cargo, valor_hora), shift_logs(clock_in_at, clock_out_at, saiu_antes, shift_log_models(model_id), statements(model_id, net_assinaturas, net_gorjetas, net_publicacoes, net_mensagens, net_indicacoes))',
      )
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
        saiuAntes: log.saiu_antes,
        modelos: await montarModelos(db, shift.turno, shift.data, log),
      },
      assist:
        sibling?.rep_id && assistLog
          ? {
              repId: sibling.rep_id,
              cargo: sibling.reps?.cargo ?? 'tertius',
              valorHora: sibling.reps?.valor_hora ?? 0,
              clockIn: new Date(assistLog.clock_in_at),
              clockOut: assistLog.clock_out_at ? new Date(assistLog.clock_out_at) : null,
              saiuAntes: assistLog.saiu_antes,
            }
          : null,
    });
  }

  // Slots onde EU sou o assistente: preciso da venda de quem eu assisti.
  for (const shift of (comoAssist ?? []) as unknown as LinhaShift[]) {
    if (!dentroDoPeriodo(shift.turno, shift.data, inicio, fim)) continue;
    const meuLog = shift.shift_logs[0];
    if (!meuLog) continue;

    const { data: siblingRows } = await db
      .from('shifts')
      .select(
        'rep_id, reps(cargo, valor_hora), shift_logs(clock_in_at, clock_out_at, saiu_antes, shift_log_models(model_id), statements(model_id, net_assinaturas, net_gorjetas, net_publicacoes, net_mensagens, net_indicacoes))',
      )
      .eq('data', shift.data)
      .eq('turno', shift.turno)
      .eq('bloco', shift.bloco)
      .eq('funcao', 'regular');
    const sibling = (siblingRows as unknown as LinhaSiblingRegular[] | null)?.[0];
    const regularLog = sibling?.shift_logs[0];
    if (!sibling?.rep_id || !regularLog) continue; // o regular ainda não bateu ponto

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
        saiuAntes: regularLog.saiu_antes,
        modelos: await montarModelos(db, shift.turno, shift.data, regularLog),
      },
      assist: {
        repId,
        cargo,
        valorHora,
        clockIn: new Date(meuLog.clock_in_at),
        clockOut: meuLog.clock_out_at ? new Date(meuLog.clock_out_at) : null,
        saiuAntes: meuLog.saiu_antes,
      },
    });
  }

  return slots;
}

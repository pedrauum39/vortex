import { buscarRegraVigente } from '@/lib/comissaoDb';
import { linhasDoSlot, type LinhaInvoice, type SlotResolvido } from '@/lib/invoice';
import { buscarAnterior } from '@/lib/statementDb';
import { criarClienteServidor } from '@/lib/supabase/server';
import { dataBRT, segundaDaSemana, somarDias } from '@/lib/tempo';
import type { Model, Rep } from '@/lib/tipos';
import { FormularioTurno } from './formulario-turno';
import { LinhaTurno } from './linha-turno';
import { NavPeriodo } from './nav-periodo';
import type { LinhaShift } from './tipos';

type Busca = { de?: string };

export default async function AdminTurnos({ searchParams }: { searchParams: Promise<Busca> }) {
  const { de } = await searchParams;
  const inicio = de ?? segundaDaSemana(dataBRT());
  const fim = somarDias(inicio, 13);

  const supabase = await criarClienteServidor();

  const [{ data: shiftsData }, { data: repsData }, { data: modelsData }] = await Promise.all([
    supabase
      .from('shifts')
      .select(
        'id, data, turno, bloco, funcao, rep_id, model_id, origem, reps(nome_curto, cargo, valor_hora), models(nome), shift_logs(id, rep_id, clock_in_at, clock_out_at, model_id_real, statements(id, net_total, net_assinaturas, net_gorjetas, net_publicacoes, net_mensagens, net_indicacoes))',
      )
      .gte('data', inicio)
      .lte('data', fim)
      .order('data')
      .order('turno')
      .order('bloco'),
    supabase.from('reps').select('*').order('turno').order('papel'),
    supabase.from('models').select('*').order('nome'),
  ]);

  const shifts = (shiftsData ?? []) as unknown as LinhaShift[];
  const reps = (repsData ?? []) as Rep[];
  const models = (modelsData ?? []) as Model[];

  // Agrupa por slot (data+turno+bloco) para achar o par regular/assist e
  // computar a comissão exatamente como o /invoice faz.
  const porSlot = new Map<string, { regular?: LinhaShift; assist?: LinhaShift }>();
  for (const s of shifts) {
    const chave = `${s.data}|${s.turno}|${s.bloco}`;
    const par = porSlot.get(chave) ?? {};
    par[s.funcao] = s;
    porSlot.set(chave, par);
  }

  const regra = await buscarRegraVigente(supabase, fim);
  const linhasPorShift = new Map<string, LinhaInvoice>();

  for (const { regular, assist } of porSlot.values()) {
    const log = regular?.shift_logs[0];
    const statement = log?.statements;
    if (!regular || !log || !statement || !regular.reps) continue;

    const minhaModelo = log.model_id_real ?? regular.model_id;
    const anterior = await buscarAnterior(supabase, regular.turno, regular.data, minhaModelo);
    const assistLog = assist?.shift_logs[0];

    const slot: SlotResolvido = {
      data: regular.data,
      turno: regular.turno,
      bloco: regular.bloco,
      regular: {
        repId: regular.rep_id!,
        cargo: regular.reps.cargo,
        valorHora: regular.reps.valor_hora,
        clockIn: new Date(log.clock_in_at),
        clockOut: log.clock_out_at ? new Date(log.clock_out_at) : null,
        statement: {
          assinaturas: Number(statement.net_assinaturas),
          gorjetas: Number(statement.net_gorjetas),
          publicacoes: Number(statement.net_publicacoes),
          mensagens: Number(statement.net_mensagens),
          indicacoes: Number(statement.net_indicacoes),
        },
        anterior: anterior.tipo === 'ok' ? anterior.linhas : null,
        anteriorPendente: anterior.tipo === 'pendente',
      },
      assist:
        assist?.rep_id && assist.reps && assistLog
          ? {
              repId: assist.rep_id,
              cargo: assist.reps.cargo,
              valorHora: assist.reps.valor_hora,
              clockIn: new Date(assistLog.clock_in_at),
              clockOut: assistLog.clock_out_at ? new Date(assistLog.clock_out_at) : null,
            }
          : null,
    };

    for (const linha of linhasDoSlot(slot, regra, new Date())) {
      const shiftId = linha.funcao === 'regular' ? regular.id : assist?.id;
      if (shiftId) linhasPorShift.set(shiftId, linha);
    }
  }

  return (
    <div className="space-y-6">
      <NavPeriodo inicio={inicio} fim={fim} />

      <FormularioTurno reps={reps} models={models} inicio={inicio} />

      {shifts.length === 0 ? (
        <div className="rounded-2xl border border-borda bg-superficie p-10 text-center">
          <p className="text-texto-fraco">Nenhum turno neste período.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-borda bg-superficie">
          <table className="w-full min-w-[72rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-borda text-left text-texto-fraco">
                <th className="px-4 py-3 font-medium">Dia</th>
                <th className="px-3 py-3 font-medium">Turno</th>
                <th className="px-3 py-3 font-medium">Bloco</th>
                <th className="px-3 py-3 font-medium">Função</th>
                <th className="px-3 py-3 font-medium">Rep</th>
                <th className="px-3 py-3 font-medium">Modelo</th>
                <th className="px-3 py-3 font-medium">Ponto</th>
                <th className="px-3 py-3 font-medium">Statement</th>
                <th className="px-3 py-3 text-right font-medium">Comissão</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {shifts.map((s) => (
                <LinhaTurno key={s.id} shift={s} linha={linhasPorShift.get(s.id) ?? null} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

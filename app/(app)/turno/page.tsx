import { exigirRep } from '@/lib/auth';
import { criarClienteServidor } from '@/lib/supabase/server';
import { diaLegivel, horaBRT } from '@/lib/tempo';
import { HORARIOS, rotuloTurno, type Bloco, type Funcao, type Model } from '@/lib/tipos';
import { dataDoTurnoAtual } from '@/lib/turno';
import { Painel } from './painel';

type TurnoDoDia = {
  id: string;
  data: string;
  bloco: Bloco;
  funcao: Funcao;
  model_id: string | null;
  models: { nome: string } | null;
  shift_logs: {
    id: string;
    clock_in_at: string;
    clock_out_at: string | null;
    model_id_real: string | null;
  }[];
};

export default async function TurnoPage() {
  const rep = await exigirRep();
  const data = dataDoTurnoAtual(rep.turno);
  const supabase = await criarClienteServidor();

  const [{ data: turnos }, { data: models }] = await Promise.all([
    supabase
      .from('shifts')
      .select(
        'id, data, bloco, funcao, model_id, models(nome), shift_logs(id, clock_in_at, clock_out_at, model_id_real)',
      )
      .eq('data', data),
    supabase.from('models').select('id, nome').order('nome'),
  ]);

  const turno = ((turnos ?? []) as unknown as TurnoDoDia[])[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Turno</h1>
        <p className="mt-1 text-sm text-texto-fraco">
          {diaLegivel(data)} · {rotuloTurno(rep.turno)} · {HORARIOS[rep.turno].inicio}–
          {HORARIOS[rep.turno].fim}
        </p>
      </div>

      {!turno ? (
        <div className="rounded-2xl border border-borda bg-superficie p-10 text-center">
          <p className="text-texto-fraco">Você não tem turno agora.</p>
        </div>
      ) : (
        <Painel
          turno={{
            id: turno.id,
            modelo: turno.models?.nome ?? `Bloco ${turno.bloco}`,
            modelId: turno.model_id,
            assist: turno.funcao === 'assist',
          }}
          log={
            turno.shift_logs[0]
              ? {
                  id: turno.shift_logs[0].id,
                  entrada: horaBRT(new Date(turno.shift_logs[0].clock_in_at)),
                  saida: turno.shift_logs[0].clock_out_at
                    ? horaBRT(new Date(turno.shift_logs[0].clock_out_at))
                    : null,
                  modelIdReal: turno.shift_logs[0].model_id_real,
                }
              : null
          }
          models={(models ?? []) as Model[]}
          repId={rep.id}
        />
      )}
    </div>
  );
}

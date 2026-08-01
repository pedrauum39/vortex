import { exigirRep } from '@/lib/auth';
import { criarClienteServidor } from '@/lib/supabase/server';
import { diaLegivel, horaBRT } from '@/lib/tempo';
import { HORARIOS, rotuloTurno, type Bloco, type Funcao, type Model } from '@/lib/tipos';
import {
  MINUTOS_DE_ANTECEDENCIA,
  dataDoTurnoAtual,
  horasDoTurno,
  janelaDoTurno,
  podeIniciar,
} from '@/lib/turno';
import { Painel } from './painel';

type TurnoDoDia = {
  id: string;
  data: string;
  bloco: Bloco;
  funcao: Funcao;
  shift_logs: {
    id: string;
    clock_in_at: string;
    clock_out_at: string | null;
    shift_log_models: { model_id: string; models: { nome: string } }[];
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
        'id, data, bloco, funcao, shift_logs(id, clock_in_at, clock_out_at, shift_log_models(model_id, models(nome)))',
      )
      // rep_id explícito: o RLS filtra o rep comum, mas o admin enxerga tudo —
      // sem isto ele cairia no turno de outra pessoa.
      .eq('data', data)
      .eq('rep_id', rep.id),
    // O roster é do TIME (bloco), não do turno — ainda não sei o bloco do
    // turno de hoje aqui em cima, então busco todo mundo ativo e filtro na tela.
    supabase.from('models').select('*').eq('ativa', true).order('nome'),
  ]);

  const turno = ((turnos ?? []) as unknown as TurnoDoDia[])[0];
  const log = turno?.shift_logs[0];

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
          turno={{ id: turno.id, bloco: turno.bloco, assist: turno.funcao === 'assist' }}
          log={
            log
              ? {
                  id: log.id,
                  entrada: horaBRT(new Date(log.clock_in_at)),
                  saida: log.clock_out_at ? horaBRT(new Date(log.clock_out_at)) : null,
                  modelos: log.shift_log_models.map((m) => ({ id: m.model_id, nome: m.models.nome })),
                  horas: horasDoTurno(
                    rep.turno,
                    data,
                    new Date(log.clock_in_at),
                    log.clock_out_at ? new Date(log.clock_out_at) : null,
                  ),
                }
              : null
          }
          models={((models ?? []) as Model[]).filter((m) => m.bloco === turno.bloco)}
          repId={rep.id}
          // Admin ignora a janela dos 15 minutos — precisa testar o fluxo
          // (OCR, comissão) sem esperar a hora certa do turno.
          podeIniciar={rep.role === 'admin' || podeIniciar(rep.turno, data)}
          abreAs={horaBRT(
            new Date(
              janelaDoTurno(rep.turno, data).inicio.getTime() -
                MINUTOS_DE_ANTECEDENCIA * 60_000,
            ),
          )}
        />
      )}
    </div>
  );
}

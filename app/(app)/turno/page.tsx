import Link from 'next/link';
import { exigirRep } from '@/lib/auth';
import { criarClienteServidor } from '@/lib/supabase/server';
import { diaLegivel, horaBRT } from '@/lib/tempo';
import { HORARIOS, TURNOS, rotuloTurno, type Bloco, type Funcao, type Model, type Turno } from '@/lib/tipos';
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
  turno: Turno;
  bloco: Bloco;
  funcao: Funcao;
  shift_logs: {
    id: string;
    clock_in_at: string;
    clock_out_at: string | null;
    saiu_antes: boolean;
    shift_log_models: { model_id: string; models: { nome: string } }[];
  }[];
};

export default async function TurnoPage({
  searchParams,
}: {
  searchParams: Promise<{ turno?: string }>;
}) {
  const rep = await exigirRep();
  const { turno: turnoEscolhido } = await searchParams;
  const supabase = await criarClienteServidor();

  // Não assume que o turno do rep hoje é o turno cadastrado no perfil dele —
  // o admin pode ter escalado alguém num turno diferente do de costume, e
  // isso precisa aparecer aqui igual. Cada turno tem sua própria regra de
  // qual dia é "hoje" (o T6/T1 cruza a meia-noite), então checa os três.
  const candidatas = [...new Set(TURNOS.map((t) => dataDoTurnoAtual(t)))];

  const { data: turnos } = await supabase
    .from('shifts')
    .select(
      'id, data, turno, bloco, funcao, shift_logs(id, clock_in_at, clock_out_at, saiu_antes, shift_log_models(model_id, models(nome)))',
    )
    // rep_id explícito: o RLS filtra o rep comum, mas o admin enxerga tudo —
    // sem isto ele cairia no turno de outra pessoa.
    .eq('rep_id', rep.id)
    .in('data', candidatas);

  // Pode haver mais de um turno "atual" ao mesmo tempo (ex.: admin escalou um
  // extra além do turno de costume no mesmo dia) — os três turnos oficiais
  // cobrem o dia inteiro sem sobrepor horário, então isto quase nunca dá só
  // um resultado; precisa de escolha, não de um .find() pegando o primeiro
  // às cegas.
  const candidatos = ((turnos ?? []) as unknown as TurnoDoDia[]).filter(
    (t) => t.data === dataDoTurnoAtual(t.turno),
  );
  const turno =
    candidatos.find((t) => t.turno === turnoEscolhido) ??
    candidatos.find((t) => t.shift_logs[0]) ??
    candidatos[0];
  const data = turno ? turno.data : dataDoTurnoAtual(rep.turno);
  const turnoDoSlot = turno?.turno ?? rep.turno;

  const { data: models } = await supabase.from('models').select('*').eq('ativa', true).order('nome');

  const log = turno?.shift_logs[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Turno</h1>
        <p className="mt-1 text-sm text-texto-fraco">
          {diaLegivel(data)} · {rotuloTurno(turnoDoSlot)} · {HORARIOS[turnoDoSlot].inicio}–
          {HORARIOS[turnoDoSlot].fim}
        </p>
      </div>

      {candidatos.length > 1 && (
        <div className="flex gap-2">
          {candidatos.map((c) => (
            <Link
              key={c.id}
              href={`/turno?turno=${c.turno}`}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                turno?.id === c.id
                  ? 'border-accent bg-accent-fraco text-accent'
                  : 'border-borda text-texto-fraco hover:text-texto'
              }`}
            >
              {rotuloTurno(c.turno)}
              {c.funcao === 'assist' && ' · Assistant'}
            </Link>
          ))}
        </div>
      )}

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
                    turnoDoSlot,
                    data,
                    new Date(log.clock_in_at),
                    log.clock_out_at ? new Date(log.clock_out_at) : null,
                    log.saiu_antes,
                  ),
                }
              : null
          }
          models={((models ?? []) as Model[]).filter((m) => m.bloco === turno.bloco)}
          repId={rep.id}
          // Admin ignora a janela dos 15 minutos — precisa testar o fluxo
          // (OCR, comissão) sem esperar a hora certa do turno.
          podeIniciar={rep.role === 'admin' || podeIniciar(turnoDoSlot, data)}
          abreAs={horaBRT(
            new Date(
              janelaDoTurno(turnoDoSlot, data).inicio.getTime() - MINUTOS_DE_ANTECEDENCIA * 60_000,
            ),
          )}
        />
      )}
    </div>
  );
}

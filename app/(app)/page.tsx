import Link from 'next/link';
import { exigirRep } from '@/lib/auth';
import { criarClienteServidor } from '@/lib/supabase/server';
import { dataBRT, diaLegivel } from '@/lib/tempo';
import { HORARIOS, rotuloTurno, type Bloco, type Funcao } from '@/lib/tipos';

type MeuTurno = {
  id: string;
  data: string;
  bloco: Bloco;
  funcao: Funcao;
  shift_logs: { shift_log_models: { models: { nome: string } }[] }[];
};

const nomeDoTurno = (t: MeuTurno) =>
  t.shift_logs[0]?.shift_log_models.map((m) => m.models.nome).join(' + ') || `Bloco ${t.bloco}`;

export default async function Dashboard() {
  const rep = await exigirRep();
  const hoje = dataBRT();
  const supabase = await criarClienteServidor();

  // rep_id explícito: o RLS filtra o rep comum, mas o admin enxerga tudo — sem
  // isto o dashboard do admin mostraria os turnos do time inteiro.
  const { data } = await supabase
    .from('shifts')
    .select('id, data, bloco, funcao, shift_logs(shift_log_models(models(nome)))')
    .eq('rep_id', rep.id)
    .gte('data', hoje)
    .order('data')
    .limit(6);

  const turnos = (data ?? []) as unknown as MeuTurno[];
  const hojeSlot = turnos.find((t) => t.data === hoje);
  const proximos = turnos.filter((t) => t.data > hoje).slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Olá, {rep.nome_curto}</h1>
        <p className="mt-1 text-sm text-texto-fraco">
          {rotuloTurno(rep.turno)} · papel {rep.papel} · {HORARIOS[rep.turno].inicio}–
          {HORARIOS[rep.turno].fim}
        </p>
      </div>

      <section className="rounded-2xl border border-borda bg-superficie p-6">
        <h2 className="text-sm font-medium text-texto-fraco">Hoje</h2>
        {hojeSlot ? (
          <>
            <p className="mt-2 text-xl font-medium">
              {nomeDoTurno(hojeSlot)}
              {hojeSlot.funcao === 'assist' && (
                <span className="ml-2 rounded-md bg-accent-fraco px-2 py-0.5 text-sm text-accent">
                  Assistant
                </span>
              )}
            </p>
            <p className="mt-1 text-sm text-texto-fraco">
              {HORARIOS[rep.turno].inicio} às {HORARIOS[rep.turno].fim}
            </p>
            <Link
              href="/turno"
              className="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-fundo transition hover:bg-accent-forte"
            >
              Ir para o turno
            </Link>
          </>
        ) : (
          <p className="mt-2 text-xl font-medium text-texto-fraco">
            {turnos.length === 0 ? 'Escala ainda não gerada' : 'Folga'}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-borda bg-superficie p-6">
        <h2 className="text-sm font-medium text-texto-fraco">Próximos turnos</h2>
        {proximos.length === 0 ? (
          <p className="mt-3 text-sm text-texto-fraco">Nada gravado à frente.</p>
        ) : (
          <ul className="mt-3 divide-y divide-borda">
            {proximos.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2.5 text-sm">
                <span>{diaLegivel(t.data)}</span>
                <span className="text-texto-fraco">
                  {nomeDoTurno(t)}
                  {t.funcao === 'assist' && ' · Assistant'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

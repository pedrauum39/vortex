import Link from 'next/link';
import { exigirRep } from '@/lib/auth';
import { criarClienteServidor } from '@/lib/supabase/server';
import { dataBRT, diaLegivel, segundaDaSemana, somarDias } from '@/lib/tempo';
import { TURNOS, rotuloTurno, type Bloco, type Turno } from '@/lib/tipos';
import { BotaoGerar } from './botao-gerar';

type Busca = { aba?: string; de?: string };

export default async function Schedule({ searchParams }: { searchParams: Promise<Busca> }) {
  const rep = await exigirRep();
  const { aba = 'meus', de } = await searchParams;

  const inicio = de ?? segundaDaSemana(dataBRT());
  const fim = somarDias(inicio, 6);
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(inicio, i));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Schedule</h1>
        <div className="ml-auto flex items-center gap-1 text-sm">
          <Link
            href={`/schedule?aba=${aba}&de=${somarDias(inicio, -7)}`}
            className="rounded-lg border border-borda px-2.5 py-1.5 text-texto-fraco hover:text-texto"
          >
            ←
          </Link>
          <span className="px-2 text-texto-fraco">
            {diaLegivel(inicio)} – {diaLegivel(fim)}
          </span>
          <Link
            href={`/schedule?aba=${aba}&de=${somarDias(inicio, 7)}`}
            className="rounded-lg border border-borda px-2.5 py-1.5 text-texto-fraco hover:text-texto"
          >
            →
          </Link>
        </div>
      </div>

      <div className="flex gap-1 border-b border-borda">
        {[
          { chave: 'meus', rotulo: 'Meus turnos' },
          { chave: 'time', rotulo: 'Time' },
        ].map(({ chave, rotulo }) => (
          <Link
            key={chave}
            href={`/schedule?aba=${chave}&de=${inicio}`}
            className={`-mb-px border-b-2 px-4 py-2 text-sm transition ${
              aba === chave
                ? 'border-accent text-accent'
                : 'border-transparent text-texto-fraco hover:text-texto'
            }`}
          >
            {rotulo}
          </Link>
        ))}
      </div>

      {aba === 'time' ? (
        <AbaTime dias={dias} admin={rep.role === 'admin'} inicio={inicio} fim={fim} />
      ) : (
        <AbaMeus repId={rep.id} inicio={inicio} fim={fim} admin={rep.role === 'admin'} />
      )}
    </div>
  );
}

// --------------------------------------------------------------- meus turnos

type MeuTurno = {
  id: string;
  data: string;
  turno: Turno;
  bloco: Bloco;
  funcao: 'regular' | 'assist';
  origem: 'gerado' | 'manual';
  models: { nome: string } | null;
  shift_logs: { clock_in_at: string; clock_out_at: string | null }[];
};

async function AbaMeus({
  repId,
  inicio,
  fim,
  admin,
}: {
  repId: string;
  inicio: string;
  fim: string;
  admin: boolean;
}) {
  const supabase = await criarClienteServidor();
  // rep_id explícito: o RLS filtra o rep comum, mas o admin enxerga tudo — sem
  // isto "Meus turnos" mostraria o time inteiro para o admin.
  const { data } = await supabase
    .from('shifts')
    .select('id, data, turno, bloco, funcao, origem, models(nome), shift_logs(clock_in_at, clock_out_at)')
    .eq('rep_id', repId)
    .gte('data', inicio)
    .lte('data', fim)
    .order('data');

  const turnos = (data ?? []) as unknown as MeuTurno[];
  if (turnos.length === 0) return <Vazia admin={admin} inicio={inicio} fim={fim} />;

  const hoje = dataBRT();

  return (
    <ul className="divide-y divide-borda rounded-2xl border border-borda bg-superficie">
      {turnos.map((t) => {
        const log = t.shift_logs[0];
        return (
          <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-6 py-4 text-base">
            <span className={t.data === hoje ? 'font-medium text-accent' : ''}>
              {diaLegivel(t.data)}
            </span>
            <span className="text-texto-fraco">{rotuloTurno(t.turno)}</span>
            <span className="text-texto-fraco">{t.models?.nome ?? `Bloco ${t.bloco}`}</span>
            {t.funcao === 'assist' && (
              <span className="rounded-md bg-accent-fraco px-2 py-0.5 text-sm text-accent">
                Assistant
              </span>
            )}
            {t.origem === 'manual' && (
              <span className="rounded-md border border-borda px-2 py-0.5 text-sm text-texto-fraco">
                alterado
              </span>
            )}
            <span className="ml-auto text-sm text-texto-fraco">
              {log?.clock_out_at
                ? 'concluído'
                : log
                  ? 'em andamento'
                  : t.data < hoje
                    ? 'sem registro'
                    : ''}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// --------------------------------------------------------------------- time

type LinhaTime = {
  data: string;
  turno: Turno;
  bloco: Bloco;
  funcao: 'regular' | 'assist';
  rep_nome: string | null;
};

async function AbaTime({
  dias,
  admin,
  inicio,
  fim,
}: {
  dias: string[];
  admin: boolean;
  inicio: string;
  fim: string;
}) {
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from('escala_time')
    .select('data, turno, bloco, funcao, rep_nome')
    .gte('data', inicio)
    .lte('data', fim);

  const linhas = (data ?? []) as LinhaTime[];
  if (linhas.length === 0) return <Vazia admin={admin} inicio={inicio} fim={fim} />;

  const busca = new Map(
    linhas.map((l) => [`${l.data}|${l.turno}|${l.bloco}|${l.funcao}`, l.rep_nome]),
  );

  return (
    <div className="overflow-x-auto rounded-2xl border border-borda bg-superficie">
      <table className="w-full min-w-[56rem] border-collapse text-base">
        <thead>
          <tr className="border-b border-borda">
            <th className="w-28 px-4 py-3.5 text-left font-medium text-texto-fraco">Turno</th>
            {dias.map((dia) => (
              <th key={dia} className="px-4 py-3.5 text-left font-medium text-texto-fraco">
                {diaLegivel(dia)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(['I', 'II'] as Bloco[]).map((bloco) => (
            <BlocoDeLinhas key={bloco} bloco={bloco} semana={dias} busca={busca} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BlocoDeLinhas({
  bloco,
  semana,
  busca,
}: {
  bloco: Bloco;
  semana: string[];
  busca: Map<string, string | null>;
}) {
  return (
    <>
      <tr className="border-b border-borda bg-superficie-alta">
        <td colSpan={8} className="px-4 py-2.5 text-sm font-medium tracking-wide text-accent">
          {bloco === 'I' ? 'TIME 1 · Vortex I' : 'TIME 2 · Vortex II'}
        </td>
      </tr>
      {TURNOS.map((turno) => (
        <tr key={turno} className="border-b border-borda last:border-0">
          <td className="px-4 py-4 text-texto-fraco">{rotuloTurno(turno)}</td>
          {semana.map((dia) => {
            const regular = busca.get(`${dia}|${turno}|${bloco}|regular`);
            const assist = busca.get(`${dia}|${turno}|${bloco}|assist`);
            return (
              <td key={dia} className="px-4 py-4 align-top">
                <div>{regular ?? <span className="text-texto-fraco">—</span>}</div>
                {assist && <div className="mt-1 text-sm text-accent">+ {assist}</div>}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

// -------------------------------------------------------------------- vazia

function Vazia({ admin, inicio, fim }: { admin: boolean; inicio: string; fim: string }) {
  return (
    <div className="rounded-2xl border border-borda bg-superficie p-10 text-center">
      <p className="text-texto-fraco">Nenhum turno gravado neste período.</p>
      {admin ? (
        <div className="mt-4">
          <BotaoGerar inicio={inicio} fim={fim} />
        </div>
      ) : (
        <p className="mt-2 text-sm text-texto-fraco">Peça ao admin para gerar a escala.</p>
      )}
    </div>
  );
}

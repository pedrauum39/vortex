import Link from 'next/link';
import { ehAdmin, exigirRep } from '@/lib/auth';
import { criarClienteServidor } from '@/lib/supabase/server';
import { dataBRT, diaLegivel, limitesDoMes, segundaDaSemana, somarDias, somarMeses } from '@/lib/tempo';
import { TURNOS, rotuloTurno, type Bloco, type Turno } from '@/lib/tipos';
import { BotaoGerar } from './botao-gerar';
import { MeusTurnos, type MeuTurno } from './meus-turnos';

type Busca = { aba?: string; de?: string; mesCal?: string };

// Sem isto, o Next serve do cache do navegador uma versão antiga da mesma
// URL — uma semana que estava vazia antes de gerar a escala continua
// aparecendo vazia depois, até o cache expirar sozinho.
export const dynamic = 'force-dynamic';

export default async function Schedule({ searchParams }: { searchParams: Promise<Busca> }) {
  const rep = await exigirRep();
  const { aba = 'meus', de, mesCal } = await searchParams;

  const inicio = de ?? segundaDaSemana(dataBRT());
  const fim = somarDias(inicio, 6);
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(inicio, i));
  const mesCalendario = mesCal ?? inicio.slice(0, 7);

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
        <AbaTime
          dias={dias}
          admin={ehAdmin(rep)}
          inicio={inicio}
          fim={fim}
          meuNome={rep.nome_curto}
        />
      ) : (
        <AbaMeus
          repId={rep.id}
          inicio={inicio}
          fim={fim}
          admin={ehAdmin(rep)}
          aba={aba}
          mesCal={mesCalendario}
        />
      )}
    </div>
  );
}

// --------------------------------------------------------------- meus turnos

async function AbaMeus({
  repId,
  inicio,
  fim,
  admin,
  aba,
  mesCal,
}: {
  repId: string;
  inicio: string;
  fim: string;
  admin: boolean;
  aba: string;
  mesCal: string;
}) {
  const supabase = await criarClienteServidor();
  const { inicio: inicioMes, fim: fimMes } = limitesDoMes(mesCal);

  // rep_id explícito: o RLS filtra o rep comum, mas o admin enxerga tudo — sem
  // isto "Meus turnos" mostraria o time inteiro para o admin.
  const [{ data }, { data: modelsData }, { data: mesData }] = await Promise.all([
    supabase
      .from('shifts')
      .select(
        'id, data, turno, bloco, funcao, origem, shift_logs(clock_in_at, clock_out_at, shift_log_models(models(nome)))',
      )
      .eq('rep_id', repId)
      .gte('data', inicio)
      .lte('data', fim)
      .order('data'),
    supabase.from('models').select('nome, bloco').eq('ativa', true).order('nome'),
    supabase.from('shifts').select('data').eq('rep_id', repId).gte('data', inicioMes).lte('data', fimMes),
  ]);

  const rosterPorBloco: Record<string, string> = {};
  for (const m of modelsData ?? []) {
    const bloco = m.bloco as Bloco;
    rosterPorBloco[bloco] = [rosterPorBloco[bloco], m.nome].filter(Boolean).join(', ');
  }

  const turnos = (data ?? []) as unknown as MeuTurno[];
  const diasComTurno = [...new Set((mesData ?? []).map((s) => s.data as string))];
  const hoje = dataBRT();

  return (
    <MeusTurnos
      turnos={turnos}
      rosterPorBloco={rosterPorBloco}
      hoje={hoje}
      admin={admin}
      inicio={inicio}
      fim={fim}
      mesCal={mesCal}
      diasComTurno={diasComTurno}
      mesAnteriorHref={`/schedule?aba=${aba}&de=${inicio}&mesCal=${somarMeses(mesCal, -1)}`}
      mesSeguinteHref={`/schedule?aba=${aba}&de=${inicio}&mesCal=${somarMeses(mesCal, 1)}`}
    />
  );
}

// --------------------------------------------------------------------- time

type LinhaTime = {
  data: string;
  turno: Turno;
  bloco: Bloco;
  funcao: 'regular' | 'assist';
  rep_nome: string | null;
  modelos_nome: string | null;
};

async function AbaTime({
  dias,
  admin,
  inicio,
  fim,
  meuNome,
}: {
  dias: string[];
  admin: boolean;
  inicio: string;
  fim: string;
  meuNome: string;
}) {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from('escala_time')
    .select('data, turno, bloco, funcao, rep_nome, modelos_nome')
    .gte('data', inicio)
    .lte('data', fim);

  // Erro de consulta (ex.: coluna que ainda não existe porque uma migração
  // não rodou) não pode virar silenciosamente "nenhum turno" — isso já
  // escondeu um problema real uma vez.
  if (error) console.error('escala_time:', error.message);

  const linhas = (data ?? []) as LinhaTime[];
  if (linhas.length === 0) return <Vazia admin={admin} inicio={inicio} fim={fim} />;

  const busca = new Map(
    linhas.map((l) => [`${l.data}|${l.turno}|${l.bloco}|${l.funcao}`, l]),
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
            <BlocoDeLinhas key={bloco} bloco={bloco} semana={dias} busca={busca} meuNome={meuNome} />
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
  meuNome,
}: {
  bloco: Bloco;
  semana: string[];
  busca: Map<string, LinhaTime>;
  meuNome: string;
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
            const souEu = regular?.rep_nome === meuNome || assist?.rep_nome === meuNome;
            return (
              <td
                key={dia}
                className={`px-4 py-4 align-top ${souEu ? 'rounded-lg ring-2 ring-inset ring-accent' : ''}`}
              >
                <div>{regular?.rep_nome ?? <span className="text-texto-fraco">—</span>}</div>
                {regular?.modelos_nome && (
                  <div className="mt-0.5 text-sm text-texto-fraco">{regular.modelos_nome}</div>
                )}
                {/* Espaço sempre reservado: o Time 2 nunca tem Assistant (regra
                    do project.md), então sem isto as linhas do Time 1 ficam mais
                    altas nas semanas com Assistant e os dois blocos desalinham. */}
                <div className="mt-1 min-h-[1.25rem] text-sm text-accent">
                  {assist?.rep_nome && `+ ${assist.rep_nome}`}
                </div>
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

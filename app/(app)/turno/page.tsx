import Link from 'next/link';
import { ehAdmin, exigirRep } from '@/lib/auth';
import { corDaMeta, metaDiariaDaPagina, percentualAtingido, temRaio } from '@/lib/meta';
import { buscarMetasDoRep, buscarRecordeDoRep } from '@/lib/metaDb';
import { criarClienteAdmin, criarClienteServidor } from '@/lib/supabase/server';
import { diaLegivel, diasNoMes, horaBRT, limitesDoMes, mesAtual, mesLegivel, somarMeses } from '@/lib/tempo';
import { HORARIOS, TURNOS, rotuloTurno, type Bloco, type Funcao, type Model, type Turno } from '@/lib/tipos';
import {
  MINUTOS_DE_ANTECEDENCIA,
  dataDoTurnoAtual,
  horasDoTurno,
  janelaDoTurno,
  podeIniciar,
} from '@/lib/turno';
import { CORES, IconeRaio } from '../meta-visual';
import { Painel } from './painel';

const dinheiro = (valor: number) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });

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
  searchParams: Promise<{ turno?: string; mes?: string }>;
}) {
  const rep = await exigirRep();
  const { turno: turnoEscolhido, mes: mesParam } = await searchParams;
  const supabase = await criarClienteServidor();

  const CAMPOS_TURNO =
    'id, data, turno, bloco, funcao, shift_logs(id, clock_in_at, clock_out_at, saiu_antes, shift_log_models(model_id, models(nome)))';

  // Não assume que o turno do rep hoje é o turno cadastrado no perfil dele —
  // o admin pode ter escalado alguém num turno diferente do de costume, e
  // isso precisa aparecer aqui igual. Cada turno tem sua própria regra de
  // qual dia é "hoje" (o T6/T1 cruza a meia-noite), então checa os três.
  const candidatas = [...new Set(TURNOS.map((t) => dataDoTurnoAtual(t)))];

  const [{ data: paraIniciar }, { data: emAberto }] = await Promise.all([
    supabase
      .from('shifts')
      .select(CAMPOS_TURNO)
      // rep_id explícito: o RLS filtra o rep comum, mas o admin enxerga tudo —
      // sem isto ele cairia no turno de outra pessoa.
      .eq('rep_id', rep.id)
      .in('data', candidatas),
    // Turno que já foi iniciado e ainda não foi fechado, não importa a data —
    // sem isto, um T6/T1 de ontem que passou das 5h (fim da janela oficial)
    // sumia da lista de candidatos assim que a data "atual" do T6/T1 virava
    // pra hoje à noite, e o rep não conseguia mais achar o turno aberto pra
    // finalizar, só o próximo (ainda nem começado). shift_logs!inner força
    // o join a exigir log — sem isso o filtro em clock_out_at não restringe
    // pra quem nem começou o turno ainda.
    supabase
      .from('shifts')
      .select(
        'id, data, turno, bloco, funcao, shift_logs!inner(id, clock_in_at, clock_out_at, saiu_antes, shift_log_models(model_id, models(nome)))',
      )
      .eq('rep_id', rep.id)
      .is('shift_logs.clock_out_at', null),
  ]);

  // Pode haver mais de um turno "atual" ao mesmo tempo (ex.: admin escalou um
  // extra além do turno de costume no mesmo dia, ou tem um em aberto pra
  // fechar e outro pra começar) — precisa de escolha, não de pegar o
  // primeiro às cegas.
  const porId = new Map<string, TurnoDoDia>();
  for (const t of (paraIniciar ?? []) as unknown as TurnoDoDia[]) {
    if (t.data === dataDoTurnoAtual(t.turno)) porId.set(t.id, t);
  }
  for (const t of (emAberto ?? []) as unknown as TurnoDoDia[]) {
    porId.set(t.id, t);
  }
  const candidatos = [...porId.values()].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));

  const turno =
    candidatos.find((t) => t.turno === turnoEscolhido) ??
    // Sem escolha explícita, prioriza o que já está em andamento (precisa
    // fechar) sobre o próximo (ainda nem começou).
    candidatos.find((t) => t.shift_logs[0] && !t.shift_logs[0].clock_out_at) ??
    candidatos.find((t) => t.shift_logs[0]) ??
    candidatos[0];
  const data = turno ? turno.data : dataDoTurnoAtual(rep.turno);
  const turnoDoSlot = turno?.turno ?? rep.turno;

  const { data: models } = await supabase.from('models').select('*').eq('ativa', true).order('nome');

  // Meta diária de cada página nesse turno: meta mensal da página, repartida
  // pelo percentual fixo do turno (42/28/30%) e pelos dias do mês — mesma
  // conta de lib/meta.ts usada no dashboard e em /admin/reps/[id].
  const diasDoMes = diasNoMes(data.slice(0, 7));
  const metasDiarias: Record<string, number> = {};
  for (const m of (models ?? []) as Model[]) {
    metasDiarias[m.id] = metaDiariaDaPagina(m.meta_mensal, turnoDoSlot, diasDoMes);
  }

  const log = turno?.shift_logs[0];

  // Só importa pro regular: pré-marca "teve assistente" no fechamento quando
  // o turno já tem alguém escalado E de fato trabalhando no papel de
  // assistente. Cliente admin de propósito — o assistente é outro rep, e a
  // RLS comum não deixa o regular ler o shift de outra pessoa.
  let temAssistente = false;
  if (turno && turno.funcao === 'regular') {
    const { data: assistShift } = await criarClienteAdmin()
      .from('shifts')
      .select('rep_id, shift_logs(id)')
      .eq('data', turno.data)
      .eq('turno', turno.turno)
      .eq('bloco', turno.bloco)
      .eq('funcao', 'assist')
      .maybeSingle();
    temAssistente = !!(assistShift?.rep_id && (assistShift.shift_logs as { id: string }[] | null)?.length);
  }

  const mes = mesParam ?? mesAtual();
  const { inicio: inicioMes, fim: fimMes } = limitesDoMes(mes);
  const diasDoMesHistorico = diasNoMes(mes);

  const [metas, recorde] = await Promise.all([
    buscarMetasDoRep(criarClienteAdmin(), rep.id, inicioMes, fimMes, diasDoMesHistorico),
    buscarRecordeDoRep(criarClienteAdmin(), rep.id),
  ]);

  const historico = metas.linhas.filter((l) => l.trabalhado);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Turnos</h1>
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
          // Todas as modelos ativas, não só as do time do turno — o rep pode
          // ter feito uma modelo de outro time (ex.: cobrindo alguém), e
          // precisa poder marcar isso mesmo fora do roster padrão.
          models={(models ?? []) as Model[]}
          metasDiarias={metasDiarias}
          temAssistente={temAssistente}
          repId={rep.id}
          // Admin (e primaris) ignora a janela dos 15 minutos — precisa
          // testar o fluxo (OCR, comissão) sem esperar a hora certa do turno.
          podeIniciar={ehAdmin(rep) || podeIniciar(turnoDoSlot, data)}
          abreAs={horaBRT(
            new Date(
              janelaDoTurno(turnoDoSlot, data).inicio.getTime() - MINUTOS_DE_ANTECEDENCIA * 60_000,
            ),
          )}
        />
      )}

      <section className="rounded-2xl border border-borda bg-superficie p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-medium">Histórico de turnos</h2>
          <div className="ml-auto flex items-center gap-1 text-sm">
            <Link
              href={`/turno?mes=${somarMeses(mes, -1)}`}
              className="rounded-lg border border-borda px-2.5 py-1.5 text-texto-fraco hover:text-texto"
            >
              ←
            </Link>
            <span className="px-2 capitalize text-texto-fraco">{mesLegivel(mes)}</span>
            <Link
              href={`/turno?mes=${somarMeses(mes, 1)}`}
              className="rounded-lg border border-borda px-2.5 py-1.5 text-texto-fraco hover:text-texto"
            >
              →
            </Link>
          </div>
        </div>

        {historico.length === 0 ? (
          <p className="mt-4 text-sm text-texto-fraco">Nenhum turno trabalhado neste mês.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-borda text-left text-texto-fraco">
                  <th className="px-3 py-2.5 font-medium">Data</th>
                  <th className="px-3 py-2.5 font-medium">Turno</th>
                  <th className="px-3 py-2.5 font-medium">Modelo(s)</th>
                  <th className="px-3 py-2.5 text-right font-medium">Meta do turno</th>
                  <th className="px-3 py-2.5 text-right font-medium">Total feito</th>
                  <th className="px-3 py-2.5 text-right font-medium">%</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((l) => {
                  const percentual = percentualAtingido(l.vendido, l.metaDoTurno);
                  const ehRecorde = recorde?.data === l.data && recorde?.turno === l.turno;
                  return (
                    <tr
                      key={`${l.data}-${l.turno}`}
                      className={`border-b border-borda last:border-0 ${
                        ehRecorde ? 'ring-2 ring-inset ring-accent' : ''
                      }`}
                    >
                      <td className="px-3 py-3">{diaLegivel(l.data)}</td>
                      <td className="px-3 py-3 text-texto-fraco">{rotuloTurno(l.turno)}</td>
                      <td className="px-3 py-3 text-accent">{l.paginas.join(' + ')}</td>
                      <td className="px-3 py-3 text-right text-texto-fraco">{dinheiro(l.metaDoTurno)}</td>
                      <td className="px-3 py-3 text-right">
                        {dinheiro(l.vendido)}
                        {l.pendente && (
                          <span className="ml-2 rounded-md border border-amber-500/40 px-2 py-0.5 text-xs text-amber-300">
                            em aberto
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {percentual === null ? (
                          <span className="text-texto-fraco">—</span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 ${CORES[corDaMeta(percentual)]}`}>
                            {percentual.toFixed(1)}%
                            {temRaio(percentual) && <IconeRaio className="size-4" />}
                          </span>
                        )}
                        {ehRecorde && (
                          <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-accent">
                            Recorde
                            {percentual !== null && temRaio(percentual) && <IconeRaio className="size-4" />}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

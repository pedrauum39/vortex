import Link from 'next/link';
import { exigirRep } from '@/lib/auth';
import { buscarRegraVigente } from '@/lib/comissaoDb';
import { linhasDoSlot, totaisDoPeriodo } from '@/lib/invoice';
import { buscarSlotsDoRep } from '@/lib/invoiceDb';
import { corDaMeta, percentualAtingido, temRaio } from '@/lib/meta';
import { buscarMetasDoRep, buscarRecordeDoRep, type RecordeTurno } from '@/lib/metaDb';
import { ROTULO_CONFIRMAR } from '@/lib/notificacoes';
import { buscarNotificacoesPendentesDoRep } from '@/lib/notificacoesDb';
import {
  buscarBonusPrimaris,
  buscarResumoPrimaris,
  type CargoPrimaris,
  type ResumoPrimaris,
} from '@/lib/primarisDb';
import { criarClienteAdmin, criarClienteServidor } from '@/lib/supabase/server';
import { dataBRT, diaLegivel, diasNoMes, limitesDoMes, mesAtual, somarMeses } from '@/lib/tempo';
import {
  HORARIOS,
  ROTULO_CARGO,
  TURNOS,
  rotuloTurno,
  type Bloco,
  type Cargo,
  type Funcao,
  type Turno,
} from '@/lib/tipos';
import { CalendarioMes, type DiaDoCalendario } from './calendario-mes';
import { CartaoInvoice } from './cartao-invoice';
import { BarraMeta, CORES, IconeRaio, LinhaMeta } from './meta-visual';
import { NotificacaoCard } from './notificacao-card';

// Sem isto, o Next serve do cache do navegador uma versão antiga da mesma
// URL (?cal=...) — trocar o mês do calendário não pegaria até o cache expirar.
export const dynamic = 'force-dynamic';

type Busca = { cal?: string };

type MeuTurno = {
  id: string;
  data: string;
  turno: Turno;
  bloco: Bloco;
  funcao: Funcao;
  shift_logs: { shift_log_models: { models: { nome: string } }[] }[];
};

/** Antes do clock-in real, mostra o roster padrão do time — é pra isso que ele existe. */
const nomeDoTurno = (t: MeuTurno, rosterPorBloco: Map<Bloco, string>) =>
  t.shift_logs[0]?.shift_log_models.map((m) => m.models.nome).join(' + ') ||
  rosterPorBloco.get(t.bloco) ||
  `Bloco ${t.bloco}`;

const dinheiro = (valor: number) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });

type SlotVazio = { data: string; turno: Turno; bloco: Bloco };

/**
 * Turnos regulares sem ninguém escalado, de hoje em diante — só pros
 * primaris, pra saberem que precisam procurar um cover. Só considera datas
 * que JÁ têm algum turno materializado (a escala foi gerada pra elas); uma
 * data futura sem nenhuma linha ainda não é "vazia", só não foi gerada.
 */
async function buscarTurnosVazios(hoje: string): Promise<SlotVazio[]> {
  const { data } = await criarClienteAdmin()
    .from('shifts')
    .select('data, turno, bloco, rep_id')
    .eq('funcao', 'regular')
    .gte('data', hoje)
    .order('data');

  const porData = new Map<string, { turno: Turno; bloco: Bloco; rep_id: string | null }[]>();
  for (const s of (data ?? []) as { data: string; turno: Turno; bloco: Bloco; rep_id: string | null }[]) {
    const linhas = porData.get(s.data) ?? [];
    linhas.push(s);
    porData.set(s.data, linhas);
  }

  const vazios: SlotVazio[] = [];
  for (const [data_, linhas] of [...porData].sort(([a], [b]) => a.localeCompare(b))) {
    for (const turno of TURNOS) {
      for (const bloco of ['I', 'II'] as Bloco[]) {
        const preenchido = linhas.some((l) => l.turno === turno && l.bloco === bloco && l.rep_id);
        if (!preenchido) vazios.push({ data: data_, turno, bloco });
      }
    }
  }
  return vazios;
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<Busca> }) {
  const { cal } = await searchParams;
  const rep = await exigirRep();
  const hoje = dataBRT();
  const supabase = await criarClienteServidor();

  const mes = mesAtual();
  const { inicio: inicioMes, fim: fimMes } = limitesDoMes(mes);
  const diasDoMes = diasNoMes(mes);
  const mesCal = cal ?? mes;

  const cargoPrimaris: CargoPrimaris | null =
    rep.cargo === 'grand_primaris' || rep.cargo === 'knight_primaris' ? rep.cargo : null;

  // rep_id explícito: o RLS filtra o rep comum, mas o admin enxerga tudo — sem
  // isto o dashboard do admin mostraria os turnos do time inteiro.
  const [
    { data },
    { data: modelsData },
    metas,
    recorde,
    slots,
    regra,
    bonus,
    turnosVazios,
    notificacoes,
    resumoTime,
  ] = await Promise.all([
    supabase
      .from('shifts')
      .select('id, data, turno, bloco, funcao, shift_logs(shift_log_models(models(nome)))')
      .eq('rep_id', rep.id)
      .gte('data', hoje)
      .order('data')
      .limit(10),
    supabase.from('models').select('nome, bloco').eq('ativa', true).eq('extra', false).order('nome'),
    // Cliente admin, não a sessão do rep: buscarAnterior() (dentro das duas
    // funções) precisa ler o statement do turno ANTERIOR na cadeia, que quase
    // sempre é de outro rep (a escala roda entre pessoas diferentes) — a RLS
    // bloqueia isso pra sessão comum, e o delta caía sempre como "pendente"
    // (contando zero) por não conseguir enxergar o statement de quem veio
    // antes, mesmo quando o print do próprio rep estava certinho.
    buscarMetasDoRep(criarClienteAdmin(), rep.id, inicioMes, fimMes, diasDoMes),
    buscarRecordeDoRep(criarClienteAdmin(), rep.id),
    buscarSlotsDoRep(rep.id, rep.cargo, rep.valor_hora, inicioMes, fimMes),
    buscarRegraVigente(criarClienteAdmin(), fimMes),
    cargoPrimaris ? buscarBonusPrimaris(criarClienteAdmin(), cargoPrimaris, inicioMes, fimMes) : null,
    cargoPrimaris ? buscarTurnosVazios(hoje) : Promise.resolve([]),
    buscarNotificacoesPendentesDoRep(supabase, rep.id, hoje).catch(() => ({ popups: [], avisos: [], todos: [] })),
    // Cliente admin: as metas do time são da empresa inteira, não da sessão do rep.
    buscarResumoPrimaris(criarClienteAdmin(), inicioMes, fimMes),
  ]);

  // O calendário pode navegar meses (?cal=). No mês corrente reaproveita
  // `metas`; num mês diferente busca de novo (só quando o rep navega).
  let metasCal = metas;
  if (mesCal !== mes) {
    const { inicio, fim } = limitesDoMes(mesCal);
    metasCal = await buscarMetasDoRep(criarClienteAdmin(), rep.id, inicio, fim, diasNoMes(mesCal));
  }

  const diasCalendario: Record<string, DiaDoCalendario> = {};
  for (const l of metasCal.linhas) {
    diasCalendario[l.data] = {
      trabalhado: l.trabalhado,
      percentual: l.trabalhado ? percentualAtingido(l.vendido, l.metaDoTurno) : null,
      bloco: l.bloco,
      modelos: l.paginas.join(', '),
    };
  }

  const linhasInvoice = slots
    .flatMap((slot) => linhasDoSlot(slot, regra, new Date()))
    .filter((l) => l.repId === rep.id);
  const totaisInvoice = totaisDoPeriodo(linhasInvoice);
  const totalInvoiceComBonus = bonus
    ? Math.round((totaisInvoice.total + bonus.partyAddition + bonus.teamAddition) * 100) / 100
    : totaisInvoice.total;

  const rosterPorBloco = new Map<Bloco, string>();
  for (const m of modelsData ?? []) {
    rosterPorBloco.set(
      m.bloco as Bloco,
      [rosterPorBloco.get(m.bloco as Bloco), m.nome].filter(Boolean).join(', '),
    );
  }

  const turnos = (data ?? []) as unknown as MeuTurno[];
  // .filter, não .find: o admin pode escalar mais de um turno no mesmo dia
  // pro mesmo rep (ex.: um T6T1 extra além do T2T3 de costume) — pegar só o
  // primeiro escondia os outros em silêncio.
  const hojeSlots = turnos.filter((t) => t.data === hoje);
  const proximos = turnos.filter((t) => t.data > hoje).slice(0, 5);

  const temAlerta =
    turnosVazios.length > 0 || notificacoes.avisos.length > 0 || notificacoes.todos.length > 0;

  return (
    <div className="space-y-6">
      {/* CABEÇALHO */}
      <div className="rounded-2xl border border-borda bg-superficie p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:justify-between">
          <div className="flex gap-4">
            <FotoRep />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <h1 className="text-2xl font-semibold tracking-tight text-accent drop-shadow-[0_0_10px_rgba(56,189,248,0.55)]">
                  {rep.nome_curto}
                </h1>
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-texto-fraco">
                    <IconeRelogio />
                    Turno
                  </div>
                  <span className="mt-1.5 inline-block rounded-lg bg-superficie-alta px-3 py-1 text-sm font-semibold">
                    {rotuloTurno(rep.turno)}
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-texto-fraco">
                    <IconeEstrela />
                    Cargo
                  </div>
                  <div className="mt-1.5">
                    <BadgeCargo cargo={rep.cargo} />
                  </div>
                </div>
              </div>

              {temAlerta && (
                <div className="mt-3 space-y-1.5 rounded-xl border border-borda bg-fundo/40 p-3">
                  {turnosVazios.map((v) => (
                    <p
                      key={`${v.data}|${v.turno}|${v.bloco}`}
                      className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-200"
                    >
                      Turno do dia {diaLegivel(v.data)}, {rotuloTurno(v.turno)} (Time {v.bloco === 'I' ? '1' : '2'})
                      está vazio, procure cover.
                    </p>
                  ))}
                  {notificacoes.avisos.map((n) => (
                    <NotificacaoCard key={n.id} id={n.id} mensagem={n.mensagem} rotuloBotao={ROTULO_CONFIRMAR.aviso} />
                  ))}
                  {notificacoes.todos.map((n) => (
                    <NotificacaoCard key={n.id} id={n.id} mensagem={n.mensagem} rotuloBotao={ROTULO_CONFIRMAR.todo} />
                  ))}
                </div>
              )}
            </div>
          </div>

          <StatusHoje slots={hojeSlots} rosterPorBloco={rosterPorBloco} semEscala={turnos.length === 0} />
        </div>
      </div>

      {/* LINHA 2 — resumo pessoal | metas do time */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ResumoPessoal
          totalVendido={dinheiro(metas.totalVendido)}
          turnosFeitos={String(metas.turnosFeitos)}
          percentualMeta={metas.percentualParcial}
          invoiceValor={dinheiro(totalInvoiceComBonus)}
          recorde={recorde}
        />
        <MetasDoTime resumo={resumoTime} />
      </div>

      {/* LINHA 3 — calendário | próximos turnos */}
      <div className="grid gap-4 lg:grid-cols-2">
        <CalendarioMes
          mesCal={mesCal}
          hoje={hoje}
          diasInfo={diasCalendario}
          mesAnteriorHref={`/?cal=${somarMeses(mesCal, -1)}`}
          mesSeguinteHref={`/?cal=${somarMeses(mesCal, 1)}`}
        />
        <ProximosTurnos proximos={proximos} rosterPorBloco={rosterPorBloco} />
      </div>
    </div>
  );
}

function FotoRep() {
  return (
    <div className="flex aspect-[3/4] w-24 shrink-0 items-center justify-center rounded-xl border border-dashed border-borda text-center text-[11px] text-texto-fraco">
      em breve
    </div>
  );
}

/** Status do dia, no canto do cabeçalho: o turno de hoje (com modelos e horário
 *  e o atalho pro turno) ou "Folga". */
function StatusHoje({
  slots,
  rosterPorBloco,
  semEscala,
}: {
  slots: MeuTurno[];
  rosterPorBloco: Map<Bloco, string>;
  semEscala: boolean;
}) {
  return (
    <div className="rounded-xl border border-borda bg-fundo/40 p-5 lg:w-96 lg:shrink-0">
      <p className="text-xs font-medium uppercase tracking-wide text-texto-fraco">Hoje</p>
      {slots.length > 0 ? (
        <>
          <div className="mt-3 space-y-3">
            {slots.map((t) => (
              <div key={t.id}>
                <p className="text-lg font-medium">
                  {rotuloTurno(t.turno)} · <span className="text-accent">{nomeDoTurno(t, rosterPorBloco)}</span>
                  {t.funcao === 'assist' && (
                    <span className="ml-2 rounded-md bg-accent-fraco px-2 py-0.5 text-sm text-accent">Assistant</span>
                  )}
                </p>
                <p className="mt-1 text-sm text-texto-fraco">
                  {HORARIOS[t.turno].inicio} às {HORARIOS[t.turno].fim}
                </p>
              </div>
            ))}
          </div>
          <Link
            href="/turno"
            className="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-fundo transition hover:bg-accent-forte"
          >
            Ir para o turno
          </Link>
        </>
      ) : (
        <p className="mt-3 text-xl font-medium text-texto-fraco">
          {semEscala ? 'Escala ainda não gerada' : 'Folga'}
        </p>
      )}
    </div>
  );
}

function ResumoPessoal({
  totalVendido,
  turnosFeitos,
  percentualMeta,
  invoiceValor,
  recorde,
}: {
  totalVendido: string;
  turnosFeitos: string;
  percentualMeta: number | null;
  invoiceValor: string;
  recorde: RecordeTurno;
}) {
  return (
    <div className="rounded-2xl border border-borda bg-superficie p-5">
      <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
        <ItemNumero rotulo="Total vendido (mês)" valor={totalVendido} />
        <ItemNumero rotulo="Turnos feitos (mês)" valor={turnosFeitos} />
        <ItemMeta percentual={percentualMeta} />
      </div>
      <div className="my-4 border-t border-borda" />
      <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
        <CartaoInvoice valor={invoiceValor} plano />
        <ItemRecorde recorde={recorde} />
      </div>
    </div>
  );
}

function ItemNumero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <p className="text-sm text-texto-fraco">{rotulo}</p>
      <p className="mt-1 text-2xl font-semibold">{valor}</p>
    </div>
  );
}

function ItemMeta({ percentual }: { percentual: number | null }) {
  return (
    <div>
      <p className="text-sm text-texto-fraco">% da meta (turnos feitos)</p>
      {percentual === null ? (
        <>
          <p className="mt-1 text-2xl font-semibold">—</p>
          <p className="mt-0.5 text-xs text-texto-fraco">meta não configurada</p>
        </>
      ) : (
        <p className={`mt-1 flex items-center gap-1.5 text-2xl font-semibold ${CORES[corDaMeta(percentual)]}`}>
          {percentual.toFixed(1)}%
          {temRaio(percentual) && <IconeRaio />}
        </p>
      )}
    </div>
  );
}

function ItemRecorde({ recorde }: { recorde: RecordeTurno }) {
  return (
    <div>
      <p className="text-sm text-texto-fraco">Turno recorde</p>
      <p className="mt-1 text-2xl font-semibold">{recorde ? dinheiro(recorde.valor) : '—'}</p>
      <p className="mt-0.5 text-xs text-texto-fraco">
        {recorde
          ? `${diaLegivel(recorde.data)} · ${rotuloTurno(recorde.turno)}`
          : 'nenhum turno com print ainda'}
      </p>
    </div>
  );
}

function MetasDoTime({ resumo }: { resumo: ResumoPrimaris }) {
  return (
    <div className="rounded-2xl border border-borda bg-superficie p-5">
      <h2 className="text-sm font-medium text-texto-fraco">Metas do time (mês)</h2>
      <div className="mt-4 space-y-5">
        <BarraMeta rotulo="Vortex" logo {...resumo.total} />
        {(['I', 'II'] as Bloco[]).map((bloco) => (
          <div key={bloco}>
            <BarraMeta rotulo={bloco === 'I' ? 'Vortex I' : 'Vortex II'} {...resumo.porTime[bloco]} />
            <div className="mt-2 space-y-1 border-l border-borda pl-3">
              {resumo.porPagina
                .filter((p) => p.bloco === bloco)
                .map((p) => (
                  <LinhaMeta
                    key={p.modeloId}
                    rotulo={p.nome}
                    vendido={p.vendido}
                    meta={p.meta}
                    percentual={p.percentual}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProximosTurnos({
  proximos,
  rosterPorBloco,
}: {
  proximos: MeuTurno[];
  rosterPorBloco: Map<Bloco, string>;
}) {
  return (
    <div className="rounded-2xl border border-borda bg-superficie p-6">
      <h2 className="text-sm font-medium text-texto-fraco">Próximos turnos</h2>
      {proximos.length === 0 ? (
        <p className="mt-3 text-sm text-texto-fraco">Nada gravado à frente.</p>
      ) : (
        <ul className="mt-3 divide-y divide-borda">
          {proximos.map((t) => (
            <li key={t.id} className="flex items-center justify-between py-2.5 text-sm">
              <span>{diaLegivel(t.data)}</span>
              <span className="text-texto-fraco">
                {rotuloTurno(t.turno)} · <span className="text-accent">{nomeDoTurno(t, rosterPorBloco)}</span>
                {t.funcao === 'assist' && ' · Assistant'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Dourado pros dois níveis de Primaris, prata pro Secundus, bronze pro Tertius.
// Admin 5C é cargo de acesso, não patente de comissão — azul do tema, fora da escala metálica.
const ESTILO_CARGO: Record<Cargo, string> = {
  grand_primaris: 'bg-gradient-to-b from-amber-300 via-yellow-400 to-yellow-600 text-yellow-950',
  knight_primaris: 'bg-gradient-to-b from-amber-300 via-yellow-400 to-yellow-600 text-yellow-950',
  secundus: 'bg-gradient-to-b from-slate-200 via-slate-300 to-slate-400 text-slate-900',
  tertius: 'bg-gradient-to-b from-orange-400 via-orange-600 to-orange-800 text-orange-50',
  admin_5c: 'bg-accent-fraco text-accent border border-accent/40',
};

function BadgeCargo({ cargo }: { cargo: Cargo }) {
  return (
    <span className={`inline-block rounded-lg px-3 py-1 text-sm font-bold shadow-sm ${ESTILO_CARGO[cargo]}`}>
      {ROTULO_CARGO[cargo]}
    </span>
  );
}

function IconeRelogio() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconeEstrela() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="size-3.5">
      <path d="M12 2l2.9 6.26 6.9.6-5.2 4.62 1.6 6.77L12 16.9l-6.2 3.35 1.6-6.77-5.2-4.62 6.9-.6L12 2Z" />
    </svg>
  );
}

import Link from 'next/link';
import { exigirRep } from '@/lib/auth';
import { buscarRegraVigente } from '@/lib/comissaoDb';
import { linhasDoSlot, totaisDoPeriodo } from '@/lib/invoice';
import { buscarSlotsDoRep } from '@/lib/invoiceDb';
import { corDaMeta, temRaio } from '@/lib/meta';
import { buscarMetasDoRep, buscarRecordeDoRep, type RecordeTurno } from '@/lib/metaDb';
import { buscarBonusPrimaris, type CargoPrimaris } from '@/lib/primarisDb';
import { criarClienteAdmin, criarClienteServidor } from '@/lib/supabase/server';
import { dataBRT, diaLegivel, diasNoMes, limitesDoMes, mesAtual } from '@/lib/tempo';
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
import { CartaoInvoice } from './cartao-invoice';
import { CORES, IconeRaio } from './meta-visual';

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

export default async function Dashboard() {
  const rep = await exigirRep();
  const hoje = dataBRT();
  const supabase = await criarClienteServidor();

  const mes = mesAtual();
  const { inicio: inicioMes, fim: fimMes } = limitesDoMes(mes);
  const diasDoMes = diasNoMes(mes);

  const cargoPrimaris: CargoPrimaris | null =
    rep.cargo === 'grand_primaris' || rep.cargo === 'knight_primaris' ? rep.cargo : null;

  // rep_id explícito: o RLS filtra o rep comum, mas o admin enxerga tudo — sem
  // isto o dashboard do admin mostraria os turnos do time inteiro.
  const [{ data }, { data: modelsData }, metas, recorde, slots, regra, bonus, turnosVazios] = await Promise.all([
    supabase
      .from('shifts')
      .select('id, data, turno, bloco, funcao, shift_logs(shift_log_models(models(nome)))')
      .eq('rep_id', rep.id)
      .gte('data', hoje)
      .order('data')
      .limit(10),
    supabase.from('models').select('nome, bloco').eq('ativa', true).order('nome'),
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
  ]);

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

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-borda bg-superficie p-5">
        <h1 className="text-2xl font-semibold tracking-tight text-accent drop-shadow-[0_0_10px_rgba(56,189,248,0.55)]">
          {rep.nome_curto}
        </h1>

        {turnosVazios.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {turnosVazios.map((v) => (
              <p
                key={`${v.data}|${v.turno}|${v.bloco}`}
                className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-200"
              >
                Turno do dia {diaLegivel(v.data)}, {rotuloTurno(v.turno)} (Time {v.bloco === 'I' ? '1' : '2'}) está
                vazio, procure cover.
              </p>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-6">
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
      </div>

      <section className="rounded-2xl border border-borda bg-superficie p-6">
        <h2 className="text-sm font-medium text-texto-fraco">Hoje</h2>
        {hojeSlots.length > 0 ? (
          <>
            <div className="mt-2 space-y-3">
              {hojeSlots.map((t) => (
                <div key={t.id}>
                  <p className="text-xl font-medium">
                    {rotuloTurno(t.turno)} · <span className="text-accent">{nomeDoTurno(t, rosterPorBloco)}</span>
                    {t.funcao === 'assist' && (
                      <span className="ml-2 rounded-md bg-accent-fraco px-2 py-0.5 text-sm text-accent">
                        Assistant
                      </span>
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
          <p className="mt-2 text-xl font-medium text-texto-fraco">
            {turnos.length === 0 ? 'Escala ainda não gerada' : 'Folga'}
          </p>
        )}
      </section>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <CartaoMeta percentual={metas.percentualParcial} />
        <Cartao rotulo="Total vendido (mês)" valor={dinheiro(metas.totalVendido)} />
        <Cartao rotulo="Turnos feitos (mês)" valor={String(metas.turnosFeitos)} />
        <CartaoInvoice valor={dinheiro(totalInvoiceComBonus)} />
        <CartaoRecorde recorde={recorde} />
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
                  {rotuloTurno(t.turno)} · <span className="text-accent">{nomeDoTurno(t, rosterPorBloco)}</span>
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

function CartaoMeta({ percentual }: { percentual: number | null }) {
  if (percentual === null) {
    return <Cartao rotulo="% da meta (turnos feitos)" valor="—" nota="meta não configurada" />;
  }

  const cor = corDaMeta(percentual);

  return (
    <div className="rounded-2xl border border-borda bg-superficie p-5">
      <p className="text-sm text-texto-fraco">% da meta (turnos feitos)</p>
      <p className={`mt-1 flex items-center gap-1.5 text-2xl font-semibold ${CORES[cor]}`}>
        {percentual.toFixed(1)}%
        {temRaio(percentual) && <IconeRaio />}
      </p>
    </div>
  );
}

function CartaoRecorde({ recorde }: { recorde: RecordeTurno }) {
  if (!recorde) {
    return <Cartao rotulo="Turno recorde" valor="—" nota="nenhum turno com print ainda" />;
  }

  return (
    <Cartao
      rotulo="Turno recorde"
      valor={dinheiro(recorde.valor)}
      nota={`${diaLegivel(recorde.data)} · ${rotuloTurno(recorde.turno)}`}
    />
  );
}

function Cartao({
  rotulo,
  valor,
  nota,
}: {
  rotulo: string;
  valor: string;
  nota?: string;
}) {
  return (
    <div className="rounded-2xl border border-borda bg-superficie p-5">
      <p className="text-sm text-texto-fraco">{rotulo}</p>
      <p className="mt-1 text-2xl font-semibold">{valor}</p>
      {nota && <p className="mt-0.5 text-xs text-texto-fraco">{nota}</p>}
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

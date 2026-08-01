import Link from 'next/link';
import { exigirRep } from '@/lib/auth';
import { buscarRegraVigente } from '@/lib/comissaoDb';
import { linhasDoSlot, totaisDoPeriodo } from '@/lib/invoice';
import { buscarSlotsDoRep } from '@/lib/invoiceDb';
import { corDaMeta, temRaio, type CorMeta } from '@/lib/meta';
import { buscarMetasDoRep, buscarRecordeDoRep, type RecordeTurno } from '@/lib/metaDb';
import { criarClienteAdmin, criarClienteServidor } from '@/lib/supabase/server';
import {
  dataBRT,
  diaLegivel,
  diasNoMes,
  limitesDoMes,
  mesAtual,
  segundaDaSemana,
  somarDias,
} from '@/lib/tempo';
import { HORARIOS, rotuloTurno, type Bloco, type Funcao } from '@/lib/tipos';
import { CartaoInvoice } from './cartao-invoice';

type MeuTurno = {
  id: string;
  data: string;
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

export default async function Dashboard() {
  const rep = await exigirRep();
  const hoje = dataBRT();
  const supabase = await criarClienteServidor();

  const mes = mesAtual();
  const { inicio: inicioMes, fim: fimMes } = limitesDoMes(mes);
  const diasDoMes = diasNoMes(mes);

  const inicioInvoice = segundaDaSemana(hoje);
  const fimInvoice = somarDias(inicioInvoice, 13);

  // rep_id explícito: o RLS filtra o rep comum, mas o admin enxerga tudo — sem
  // isto o dashboard do admin mostraria os turnos do time inteiro.
  const [{ data }, { data: modelsData }, metas, recorde, slots, regra] = await Promise.all([
    supabase
      .from('shifts')
      .select('id, data, bloco, funcao, shift_logs(shift_log_models(models(nome)))')
      .eq('rep_id', rep.id)
      .gte('data', hoje)
      .order('data')
      .limit(6),
    supabase.from('models').select('nome, bloco').eq('ativa', true).order('nome'),
    buscarMetasDoRep(supabase, rep.id, inicioMes, fimMes, diasDoMes),
    buscarRecordeDoRep(supabase, rep.id),
    buscarSlotsDoRep(rep.id, rep.cargo, rep.valor_hora, inicioInvoice, fimInvoice),
    buscarRegraVigente(criarClienteAdmin(), fimInvoice),
  ]);

  const linhasInvoice = slots
    .flatMap((slot) => linhasDoSlot(slot, regra, new Date()))
    .filter((l) => l.repId === rep.id);
  const totaisInvoice = totaisDoPeriodo(linhasInvoice);

  const rosterPorBloco = new Map<Bloco, string>();
  for (const m of modelsData ?? []) {
    rosterPorBloco.set(
      m.bloco as Bloco,
      [rosterPorBloco.get(m.bloco as Bloco), m.nome].filter(Boolean).join(', '),
    );
  }

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
              {nomeDoTurno(hojeSlot, rosterPorBloco)}
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

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <CartaoMeta percentual={metas.percentualParcial} />
        <Cartao rotulo="Total vendido (mês)" valor={dinheiro(metas.totalVendido)} />
        <Cartao rotulo="Turnos feitos (mês)" valor={String(metas.turnosFeitos)} />
        <CartaoInvoice valor={dinheiro(totaisInvoice.total)} />
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
                  {nomeDoTurno(t, rosterPorBloco)}
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

const CORES: Record<CorMeta, string> = {
  vermelho: 'text-red-400',
  amarelo: 'text-amber-300',
  verde: 'text-green-400',
  'azul-neon': 'text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.75)]',
};

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

function IconeRaio() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="size-5">
      <path d="M13 2 3 14h7l-1 8 11-14h-7l0-6Z" />
    </svg>
  );
}

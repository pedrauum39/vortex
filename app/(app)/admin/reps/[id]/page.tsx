import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buscarMetasDoRep } from '@/lib/metaDb';
import { criarClienteServidor } from '@/lib/supabase/server';
import { diaLegivel, diasNoMes, limitesDoMes, mesAtual, mesLegivel, somarMeses } from '@/lib/tempo';
import { ROTULO_CARGO, rotuloTurno, type Rep } from '@/lib/tipos';

const dinheiro = (valor: number) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });

const percentual = (valor: number | null) => (valor === null ? '—' : `${valor.toFixed(1)}%`);

type Busca = { mes?: string };

// Sem isto, o Next serve do cache do navegador uma versão antiga da mesma
// URL — um mês que ainda não tinha turno algum continua aparecendo vazio
// depois, até o cache expirar sozinho.
export const dynamic = 'force-dynamic';

export default async function DetalheRep({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Busca>;
}) {
  const { id } = await params;
  const { mes: mesParam } = await searchParams;
  const mes = mesParam ?? mesAtual();

  const supabase = await criarClienteServidor();
  const { data: repData } = await supabase.from('reps').select('*').eq('id', id).maybeSingle();
  if (!repData) notFound();
  const rep = repData as Rep;

  const { inicio, fim } = limitesDoMes(mes);
  const diasDoMes = diasNoMes(mes);

  const metas = await buscarMetasDoRep(supabase, id, inicio, fim, diasDoMes);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/reps" className="text-sm text-texto-fraco hover:text-texto">
          ← reps
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{rep.nome_curto}</h1>
        <p className="mt-1 text-sm text-texto-fraco">
          {rep.nome_oficial} · {rotuloTurno(rep.turno)} · {ROTULO_CARGO[rep.cargo]}
        </p>
      </div>

      <div className="flex items-center gap-1 text-sm">
        <Link
          href={`/admin/reps/${id}?mes=${somarMeses(mes, -1)}`}
          className="rounded-lg border border-borda px-2.5 py-1.5 text-texto-fraco hover:text-texto"
        >
          ←
        </Link>
        <span className="px-2 capitalize text-texto-fraco">{mesLegivel(mes)}</span>
        <Link
          href={`/admin/reps/${id}?mes=${somarMeses(mes, 1)}`}
          className="rounded-lg border border-borda px-2.5 py-1.5 text-texto-fraco hover:text-texto"
        >
          →
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Cartao rotulo="Meta total do mês" valor={dinheiro(metas.metaTotal)} />
        <Cartao rotulo="Total NET vendido" valor={dinheiro(metas.totalVendido)} />
        <Cartao rotulo="% da meta total atingida" valor={percentual(metas.percentualTotal)} />
        <Cartao
          rotulo={`Meta parcial (${metas.turnosFeitos} turno${metas.turnosFeitos === 1 ? '' : 's'} feito${metas.turnosFeitos === 1 ? '' : 's'})`}
          valor={dinheiro(metas.metaParcial)}
        />
        <Cartao rotulo="% da meta parcial atingida" valor={percentual(metas.percentualParcial)} destaque />
      </div>

      {metas.linhas.length === 0 ? (
        <div className="rounded-2xl border border-borda bg-superficie p-10 text-center">
          <p className="text-texto-fraco">Nenhum turno agendado pra ele neste mês.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-borda bg-superficie">
          <table className="w-full min-w-[48rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-borda text-left text-texto-fraco">
                <th className="px-4 py-3 font-medium">Dia</th>
                <th className="px-3 py-3 font-medium">Turno</th>
                <th className="px-3 py-3 font-medium">Página(s)</th>
                <th className="px-3 py-3 text-right font-medium">Meta do turno</th>
                <th className="px-3 py-3 text-right font-medium">Vendido</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {metas.linhas.map((l) => (
                <tr key={`${l.data}-${l.turno}`} className="border-b border-borda last:border-0">
                  <td className="px-4 py-2.5">{diaLegivel(l.data)}</td>
                  <td className="px-3 py-2.5 text-texto-fraco">{rotuloTurno(l.turno)}</td>
                  <td className="px-3 py-2.5">
                    {l.paginas.join(', ') || <span className="text-texto-fraco">—</span>}
                    {l.planejado && <span className="ml-2 text-xs text-texto-fraco">(planejado)</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right text-texto-fraco">{dinheiro(l.metaDoTurno)}</td>
                  <td className="px-3 py-2.5 text-right">
                    {l.trabalhado ? dinheiro(l.vendido) : <span className="text-texto-fraco">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-texto-fraco">
                    {!l.trabalhado ? 'futuro' : l.pendente ? 'aguardando print' : 'concluído'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Cartao({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="rounded-2xl border border-borda bg-superficie p-5">
      <p className="text-sm text-texto-fraco">{rotulo}</p>
      <p className={`mt-1 text-2xl font-semibold ${destaque ? 'text-accent' : ''}`}>{valor}</p>
    </div>
  );
}

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { exigirRep } from '@/lib/auth';
import { corDaMeta, temRaio } from '@/lib/meta';
import { buscarHistoricoModelos, buscarResumoPrimaris, type EventoHistorico, type ResumoPagina } from '@/lib/primarisDb';
import { criarClienteAdmin } from '@/lib/supabase/server';
import { diaLegivel, limitesDoMes, mesAtual, mesLegivel, somarMeses } from '@/lib/tempo';
import { ROTULO_CARGO, type Bloco } from '@/lib/tipos';
import { BarraMeta, CORES, IconeRaio } from '../meta-visual';

type Busca = { mes?: string };

const dinheiro = (valor: number) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });

const percentual = (valor: number | null) => (valor === null ? '—' : `${valor.toFixed(1)}%`);

const NOME_TIME: Record<Bloco, string> = { I: 'Time 1 · Vortex I', II: 'Time 2 · Vortex II' };

// Sem isto, o Next serve do cache do navegador uma versão antiga da mesma
// URL — um mês que ainda não tinha venda alguma continua aparecendo vazio
// depois, até o cache expirar sozinho.
export const dynamic = 'force-dynamic';

export default async function Primaris({ searchParams }: { searchParams: Promise<Busca> }) {
  const rep = await exigirRep();
  const ehPrimaris = rep.cargo === 'grand_primaris' || rep.cargo === 'knight_primaris';
  if (!ehPrimaris && !rep.observador && rep.cargo !== 'admin_5c') redirect('/');

  const { mes: mesParam } = await searchParams;
  const mes = mesParam ?? mesAtual();
  const { inicio, fim } = limitesDoMes(mes);

  const [resumo, historico] = await Promise.all([
    buscarResumoPrimaris(criarClienteAdmin(), inicio, fim),
    buscarHistoricoModelos(criarClienteAdmin(), inicio, fim),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Primaris</h1>
        <div className="ml-auto flex items-center gap-1 text-sm">
          <Link
            href={`/primaris?mes=${somarMeses(mes, -1)}`}
            className="rounded-lg border border-borda px-2.5 py-1.5 text-texto-fraco hover:text-texto"
          >
            ←
          </Link>
          <span className="px-2 capitalize text-texto-fraco">{mesLegivel(mes)}</span>
          <Link
            href={`/primaris?mes=${somarMeses(mes, 1)}`}
            className="rounded-lg border border-borda px-2.5 py-1.5 text-texto-fraco hover:text-texto"
          >
            →
          </Link>
        </div>
      </div>

      <section className="rounded-2xl border border-borda bg-superficie p-5">
        <h2 className="text-sm font-medium text-texto-fraco">Vortex — meta total (os dois times)</h2>
        <div className="mt-3">
          <BarraMeta {...resumo.total} />
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {(['I', 'II'] as Bloco[]).map((bloco) => (
          <div key={bloco} className="rounded-2xl border border-borda bg-superficie p-5">
            <h2 className="text-sm font-medium text-accent">{NOME_TIME[bloco]}</h2>
            <div className="mt-3">
              <BarraMeta {...resumo.porTime[bloco]} />
            </div>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-texto-fraco">Por rep</h2>
        <div className="overflow-x-auto rounded-2xl border border-borda bg-superficie">
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-borda text-left text-texto-fraco">
                <th className="px-4 py-3 font-medium">Rep</th>
                <th className="px-3 py-3 font-medium">Cargo</th>
                <th className="px-3 py-3 text-right font-medium">Vendido no mês</th>
                <th className="px-3 py-3 text-right font-medium">Meta</th>
                <th className="px-4 py-3 text-right font-medium">% atingida</th>
              </tr>
            </thead>
            <tbody>
              {resumo.porRep.map((r) => (
                <tr key={r.repId} className="border-b border-borda last:border-0">
                  <td className="px-4 py-2.5">
                    <Link href={`/primaris/${r.repId}?mes=${mes}`} className="text-accent hover:underline">
                      {r.nomeCurto}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-texto-fraco">{ROTULO_CARGO[r.cargo]}</td>
                  <td className="px-3 py-2.5 text-right font-medium">{dinheiro(r.vendido)}</td>
                  <td className="px-3 py-2.5 text-right text-texto-fraco">{dinheiro(r.meta)}</td>
                  <td className="px-4 py-2.5 text-right font-medium">{percentual(r.percentual)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-texto-fraco">Por página</h2>
        <div className="overflow-x-auto rounded-2xl border border-borda bg-superficie">
          <table className="w-full min-w-[44rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-borda text-left text-texto-fraco">
                <th className="px-4 py-3 font-medium">Página</th>
                <th className="px-3 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Meta do mês</th>
                <th className="px-4 py-3 text-right font-medium">Projeção (ritmo atual)</th>
              </tr>
            </thead>
            <tbody>
              {resumo.porPagina.map((p) => (
                <LinhaPagina key={p.modeloId} pagina={p} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {historico.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-texto-fraco">Histórico</h2>
          <div className="overflow-x-auto rounded-2xl border border-borda bg-superficie">
            <table className="w-full min-w-[40rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-borda text-left text-texto-fraco">
                  <th className="px-4 py-3 font-medium">Modelo</th>
                  <th className="px-3 py-3 font-medium">Mudança</th>
                  <th className="px-3 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 text-right font-medium">Vendido no período</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((evento, i) => (
                  <LinhaHistorico key={i} evento={evento} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function LinhaPagina({ pagina }: { pagina: ResumoPagina }) {
  return (
    <tr className="border-b border-borda last:border-0">
      <td className="px-4 py-3">{pagina.nome}</td>
      <td className="px-3 py-3 text-texto-fraco">{pagina.bloco === 'I' ? 'Vortex I' : 'Vortex II'}</td>
      <td className="px-4 py-3">
        <BarraMeta vendido={pagina.vendido} meta={pagina.meta} percentual={pagina.percentual} compacta />
      </td>
      <td className="px-4 py-3 text-right">
        {pagina.projecao === null ? (
          <span className="text-texto-fraco">—</span>
        ) : (
          <div>
            <div className="font-medium">{dinheiro(pagina.projecao)}</div>
            {pagina.percentualProjetado !== null && (
              <div
                className={`mt-0.5 inline-flex items-center gap-1 text-xs ${CORES[corDaMeta(pagina.percentualProjetado)]}`}
              >
                {percentual(pagina.percentualProjetado)}
                {temRaio(pagina.percentualProjetado) && <IconeRaio className="size-3.5" />}
              </div>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

function LinhaHistorico({ evento }: { evento: EventoHistorico }) {
  const destino = evento.blocoDestino === null ? 'desativada' : NOME_TIME[evento.blocoDestino];
  return (
    <tr className="border-b border-borda last:border-0">
      <td className="px-4 py-3">{evento.modeloNome}</td>
      <td className="px-3 py-3 text-texto-fraco">
        {NOME_TIME[evento.blocoOrigem]} → {destino}
      </td>
      <td className="px-3 py-3 text-texto-fraco">{diaLegivel(evento.data)}</td>
      <td className="px-4 py-3 text-right font-medium">{dinheiro(evento.vendido)}</td>
    </tr>
  );
}


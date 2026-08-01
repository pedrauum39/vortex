import Link from 'next/link';
import { exigirRep } from '@/lib/auth';
import { buscarRegraVigente } from '@/lib/comissaoDb';
import { linhasDoSlot, totaisDoPeriodo } from '@/lib/invoice';
import { criarClienteAdmin } from '@/lib/supabase/server';
import { dataBRT, diaLegivel, segundaDaSemana, somarDias } from '@/lib/tempo';
import { ROTULO_CARGO, rotuloTurno } from '@/lib/tipos';
import { buscarSlotsDoRep } from './dados';

type Busca = { de?: string };

const dinheiro = (valor: number) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });

export default async function InvoicePage({ searchParams }: { searchParams: Promise<Busca> }) {
  const rep = await exigirRep();
  const { de } = await searchParams;

  const inicio = de ?? segundaDaSemana(dataBRT());
  const fim = somarDias(inicio, 13);
  const agora = new Date();

  const [slots, regra] = await Promise.all([
    buscarSlotsDoRep(rep.id, rep.cargo, rep.valor_hora, inicio, fim),
    buscarRegraVigente(criarClienteAdmin(), fim),
  ]);

  const linhas = slots
    .flatMap((slot) => linhasDoSlot(slot, regra, agora))
    .filter((l) => l.repId === rep.id)
    .sort((a, b) => a.data.localeCompare(b.data));

  const totais = totaisDoPeriodo(linhas);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Invoice</h1>
        <div className="ml-auto flex items-center gap-1 text-sm">
          <Link
            href={`/invoice?de=${somarDias(inicio, -14)}`}
            className="rounded-lg border border-borda px-2.5 py-1.5 text-texto-fraco hover:text-texto"
          >
            ←
          </Link>
          <span className="px-2 text-texto-fraco">
            {diaLegivel(inicio)} – {diaLegivel(fim)}
          </span>
          <Link
            href={`/invoice?de=${somarDias(inicio, 14)}`}
            className="rounded-lg border border-borda px-2.5 py-1.5 text-texto-fraco hover:text-texto"
          >
            →
          </Link>
        </div>
      </div>

      <p className="text-sm text-texto-fraco">
        {rep.nome_curto} · {ROTULO_CARGO[rep.cargo]} · {dinheiro(rep.valor_hora)}/h
      </p>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Cartao rotulo="Horas" valor={dinheiro(totais.valorHoras)} nota={`${totais.horas.toFixed(2)}h`} />
        <Cartao rotulo="Comissão" valor={dinheiro(totais.comissao)} />
        <Cartao rotulo="Total" valor={dinheiro(totais.total)} destaque />
        <Cartao
          rotulo="Turnos"
          valor={String(totais.turnos)}
          nota={
            totais.pendentes > 0
              ? `${totais.pendentes} em aberto`
              : totais.parciais > 0
                ? `${totais.parciais} em andamento`
                : undefined
          }
        />
      </section>

      {totais.pendentes > 0 && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-200">
          {totais.pendentes} {totais.pendentes === 1 ? 'turno está' : 'turnos estão'} sem
          comissão calculada — falta o print do statement de algum turno da cadeia. O valor se
          ajusta sozinho assim que o print chegar.
        </p>
      )}

      {linhas.length === 0 ? (
        <div className="rounded-2xl border border-borda bg-superficie p-10 text-center">
          <p className="text-texto-fraco">Nenhum turno com ponto batido neste período.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-borda bg-superficie">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-borda text-left text-texto-fraco">
                <th className="px-4 py-3 font-medium">Dia</th>
                <th className="px-3 py-3 font-medium">Turno</th>
                <th className="px-3 py-3 font-medium">Papel</th>
                <th className="px-3 py-3 text-right font-medium">Horas</th>
                <th className="px-3 py-3 text-right font-medium">Base</th>
                <th className="px-3 py-3 text-right font-medium">Comissão</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={`${l.data}-${l.turno}-${l.bloco}-${l.funcao}`} className="border-b border-borda last:border-0">
                  <td className="px-4 py-3">{diaLegivel(l.data)}</td>
                  <td className="px-3 py-3 text-texto-fraco">{rotuloTurno(l.turno)}</td>
                  <td className="px-3 py-3">
                    {l.funcao === 'assist' ? (
                      <span className="rounded-md bg-accent-fraco px-2 py-0.5 text-xs text-accent">
                        Assistant
                      </span>
                    ) : (
                      <span className="text-texto-fraco">Regular</span>
                    )}
                    {l.parcial && (
                      <span className="ml-2 rounded-md border border-borda px-2 py-0.5 text-xs text-texto-fraco">
                        em andamento
                      </span>
                    )}
                    {l.pendente && (
                      <span className="ml-2 rounded-md border border-amber-500/40 px-2 py-0.5 text-xs text-amber-300">
                        em aberto
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">{l.horas.toFixed(2)}h</td>
                  <td className="px-3 py-3 text-right text-texto-fraco">
                    {l.funcao === 'regular' ? dinheiro(l.base) : '—'}
                  </td>
                  <td className="px-3 py-3 text-right">{dinheiro(l.comissao)}</td>
                  <td className="px-4 py-3 text-right font-medium">{dinheiro(l.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Cartao({
  rotulo,
  valor,
  nota,
  destaque,
}: {
  rotulo: string;
  valor: string;
  nota?: string;
  destaque?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-borda bg-superficie p-4">
      <p className="text-xs text-texto-fraco">{rotulo}</p>
      <p className={`mt-1 text-xl font-medium ${destaque ? 'text-accent' : ''}`}>{valor}</p>
      {nota && <p className="mt-0.5 text-xs text-texto-fraco">{nota}</p>}
    </div>
  );
}

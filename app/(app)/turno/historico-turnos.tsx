'use client';

import { Fragment, useState } from 'react';
import { corDaMeta, percentualAtingido, temRaio } from '@/lib/meta';
import type { LinhaMetaTurno, RecordeTurno } from '@/lib/metaDb';
import { diaLegivel } from '@/lib/tempo';
import { rotuloTurno } from '@/lib/tipos';
import { CORES, IconeRaio } from '../meta-visual';

const dinheiro = (valor: number) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });

export type LinhaHistorico = LinhaMetaTurno & {
  resumo: string | null;
  assistNome: string | null;
};

/** Tabela do histórico de turnos, com uma linha de "detalhes" expansível
 * (resumo escrito no fechamento + quem assistiu, quando tiver algum dos
 * dois) — client component só por causa desse expand/colapso. */
export function HistoricoTurnos({
  historico,
  recorde,
}: {
  historico: LinhaHistorico[];
  recorde: RecordeTurno;
}) {
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  function alternar(chave: string) {
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });
  }

  return (
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
            <th className="px-3 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {historico.map((l) => {
            const chave = `${l.data}-${l.turno}`;
            const percentual = percentualAtingido(l.vendido, l.metaDoTurno);
            const ehRecorde = recorde?.data === l.data && recorde?.turno === l.turno;
            const temDetalhe = !!(l.resumo || l.assistNome);
            const aberta = abertos.has(chave);

            return (
              <Fragment key={chave}>
                <tr
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
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="inline-flex items-center gap-1">
                        {percentual === null ? (
                          <span className="text-texto-fraco">—</span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 ${CORES[corDaMeta(percentual)]}`}>
                            {percentual.toFixed(1)}%
                            {temRaio(percentual) && <IconeRaio className="size-4" />}
                          </span>
                        )}
                        {ehRecorde && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-accent">
                            Recorde
                            {percentual !== null && temRaio(percentual) && <IconeRaio className="size-4" />}
                          </span>
                        )}
                      </span>
                      {l.porPagina.length > 1 && (
                        <div className="text-xs text-texto-fraco">
                          {l.porPagina.map((p) => {
                            const pctPagina = percentualAtingido(p.vendido, p.meta);
                            return (
                              <div key={p.nome}>
                                {p.nome}: {dinheiro(p.vendido)} / {dinheiro(p.meta)}{' '}
                                {pctPagina === null ? '—' : `(${pctPagina.toFixed(0)}%)`}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    {temDetalhe && (
                      <button
                        type="button"
                        onClick={() => alternar(chave)}
                        className="text-xs text-accent hover:underline"
                      >
                        {aberta ? 'esconder' : 'detalhes'}
                      </button>
                    )}
                  </td>
                </tr>
                {aberta && temDetalhe && (
                  <tr className="border-b border-borda bg-fundo last:border-0">
                    <td colSpan={7} className="px-3 py-3 text-sm text-texto-fraco">
                      {l.resumo && <p>{l.resumo}</p>}
                      {l.assistNome && (
                        <p className={l.resumo ? 'mt-1.5' : ''}>
                          Assistente: <span className="text-texto">{l.assistNome}</span>
                        </p>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

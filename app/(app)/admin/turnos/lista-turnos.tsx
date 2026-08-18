'use client';

import { useState } from 'react';
import type { LinhaInvoice } from '@/lib/invoice';
import type { Model } from '@/lib/tipos';
import { LinhaTurno } from './linha-turno';
import type { LinhaShift } from './tipos';

export function ListaTurnos({
  emAtencao,
  concluidos,
  linhasPorShift,
  models,
  podeEditar,
}: {
  emAtencao: LinhaShift[];
  concluidos: LinhaShift[];
  linhasPorShift: Record<string, LinhaInvoice>;
  models: Model[];
  podeEditar: boolean;
}) {
  const [mostrarConcluidos, setMostrarConcluidos] = useState(false);

  if (emAtencao.length === 0 && concluidos.length === 0) {
    return (
      <div className="rounded-2xl border border-borda bg-superficie p-10 text-center">
        <p className="text-texto-fraco">Nenhum turno neste período.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {emAtencao.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-amber-300">
            Precisam de atenção ({emAtencao.length})
          </p>
          <Tabela linhas={emAtencao} linhasPorShift={linhasPorShift} models={models} podeEditar={podeEditar} />
        </div>
      )}

      {concluidos.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setMostrarConcluidos((v) => !v)}
            className="mb-2 flex items-center gap-1.5 text-sm text-texto-fraco hover:text-texto"
          >
            <span className={`inline-block transition-transform ${mostrarConcluidos ? 'rotate-90' : ''}`}>▸</span>
            Turnos concluídos ({concluidos.length})
          </button>
          {mostrarConcluidos && (
            <Tabela linhas={concluidos} linhasPorShift={linhasPorShift} models={models} podeEditar={podeEditar} />
          )}
        </div>
      )}
    </div>
  );
}

function Tabela({
  linhas,
  linhasPorShift,
  models,
  podeEditar,
}: {
  linhas: LinhaShift[];
  linhasPorShift: Record<string, LinhaInvoice>;
  models: Model[];
  podeEditar: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-borda bg-superficie">
      <table className="w-full min-w-[72rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-borda text-left text-texto-fraco">
            <th className="px-4 py-3 font-medium">Dia</th>
            <th className="px-3 py-3 font-medium">Turno</th>
            <th className="px-3 py-3 font-medium">Bloco</th>
            <th className="px-3 py-3 font-medium">Função</th>
            <th className="px-3 py-3 font-medium">Rep</th>
            <th className="px-3 py-3 font-medium">Ponto</th>
            <th className="px-3 py-3 font-medium">Statements</th>
            <th className="px-3 py-3 text-right font-medium">Comissão</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {linhas.map((s) => (
            <LinhaTurno
              key={s.id}
              shift={s}
              linha={linhasPorShift[s.id] ?? null}
              models={models}
              podeEditar={podeEditar}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

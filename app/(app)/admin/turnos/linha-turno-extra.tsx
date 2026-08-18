'use client';

import { useState, useTransition } from 'react';
import { diaLegivel } from '@/lib/tempo';
import { rotuloTurno } from '@/lib/tipos';
import type { LinhaTurnoExtra } from '@/lib/turnosExtraDb';
import { apagarTurnoExtraAdmin } from './actions';

const dinheiro = (valor: number) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });

export function LinhaTurnoExtraAdmin({
  linha,
  podeEditar,
}: {
  linha: LinhaTurnoExtra & { repNome: string };
  podeEditar: boolean;
}) {
  const [pendente, executar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <tr className="border-b border-borda last:border-0">
      <td className="px-4 py-2.5">{diaLegivel(linha.data)}</td>
      <td className="px-3 py-2.5 text-texto-fraco">{rotuloTurno(linha.turno)}</td>
      <td className="px-3 py-2.5">{linha.repNome}</td>
      <td className="px-3 py-2.5 text-accent">{linha.modeloNome}</td>
      <td className="px-3 py-2.5 text-right">{dinheiro(linha.vendido)}</td>
      <td className="px-3 py-2.5 text-right font-medium">{dinheiro(linha.comissao)}</td>
      <td className="whitespace-nowrap px-4 py-2.5 text-right">
        {podeEditar && (
          <button
            type="button"
            disabled={pendente}
            onClick={() => {
              if (confirm('Apagar este turno extra?')) {
                executar(async () => {
                  setErro(null);
                  try {
                    await apagarTurnoExtraAdmin(linha.id);
                  } catch (e) {
                    setErro(e instanceof Error ? e.message : 'Não deu.');
                  }
                });
              }
            }}
            className="text-xs text-red-400 hover:underline disabled:opacity-50"
          >
            apagar
          </button>
        )}
        {erro && <span className="ml-2 text-xs text-red-400">{erro}</span>}
      </td>
    </tr>
  );
}

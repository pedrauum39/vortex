'use client';

import { useState } from 'react';
import {
  agruparPorDiaDaMudanca,
  diaMes,
  textoDoLog,
  type EntradaLog,
} from '@/lib/logEscala';
import { ROTULO_CARGO, rotuloTurno } from '@/lib/tipos';

/**
 * Lista as trocas de rep feitas na semana aberta na grade, agrupadas pelo dia
 * em que foram salvas. O botão "Copiar" joga o texto todo (versão sem
 * marcação, de logEscala.textoDoLog) no clipboard.
 */
export function LogAlteracoes({ entradas }: { entradas: EntradaLog[] }) {
  const [copiado, setCopiado] = useState(false);

  if (entradas.length === 0) return null;
  const grupos = agruparPorDiaDaMudanca(entradas);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(textoDoLog(grupos));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // navegador sem permissão de clipboard — não trava a tela, só não copia.
    }
  }

  return (
    <div className="rounded-2xl border border-borda bg-superficie">
      <div className="flex items-center justify-between gap-3 border-b border-borda px-4 py-3">
        <p className="text-sm font-medium text-texto-fraco">Mudanças feitas na semana</p>
        <button
          type="button"
          onClick={copiar}
          className="rounded-lg border border-borda px-3 py-1.5 text-xs font-medium transition hover:border-accent"
        >
          {copiado ? 'Copiado!' : 'Copiar'}
        </button>
      </div>
      <div className="divide-y divide-borda">
        {grupos.map((grupo) => (
          <div key={grupo.diaMudanca} className="px-4 py-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-accent">
              Mudanças feitas {diaMes(grupo.diaMudanca)}
            </p>
            <ul className="space-y-3">
              {grupo.itens.map((item) => (
                <li key={item.id} className="text-sm">
                  <p className="text-texto-fraco">
                    {rotuloTurno(item.turno)}
                    {item.funcao === 'assist' ? ' (Assistant)' : ''} · {diaMes(item.data)}
                    {item.modelosDoBloco.length > 0 && ` · ${item.modelosDoBloco.join(' + ')}`}
                  </p>
                  {item.repSaiu && (
                    <p>
                      <span className="text-texto-fraco">Sai:</span> {item.repSaiu}
                      {item.cargoSaiu && ` (${ROTULO_CARGO[item.cargoSaiu]})`}
                    </p>
                  )}
                  {item.repEntrou && (
                    <p>
                      <span className="text-texto-fraco">Entra:</span> {item.repEntrou}
                      {item.cargoEntrou && ` (${ROTULO_CARGO[item.cargoEntrou]})`}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

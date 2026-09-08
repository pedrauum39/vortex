'use client';

import { useState } from 'react';
import { agruparLog, cabecalhoDoGrupo, diaMes, textoDoLog, type EntradaLog, type LadoLog } from '@/lib/logEscala';
import { rotuloTurno } from '@/lib/tipos';

/**
 * Lista as trocas de rep feitas na semana aberta na grade, agrupadas por quem
 * fez + o dia, depois por turno+dia, depois por time. O botão "Copiar" joga o
 * texto todo (com `**negrito**` pro Telegram) no clipboard.
 */
export function LogAlteracoes({ entradas }: { entradas: EntradaLog[] }) {
  const [copiado, setCopiado] = useState(false);

  if (entradas.length === 0) return null;
  const grupos = agruparLog(entradas);

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
          <div key={`${grupo.diaMudanca}|${grupo.alteradoPor ?? ''}`} className="px-4 py-3">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-accent">
              {cabecalhoDoGrupo(grupo)}
            </p>
            <div className="space-y-4">
              {grupo.turnos.map((td) => (
                <div key={`${td.turno}|${td.data}`}>
                  <p className="text-sm font-semibold">
                    <span className="text-accent">➤</span> {rotuloTurno(td.turno)} · {diaMes(td.data)}
                  </p>
                  <div className="mt-1.5 space-y-2.5">
                    {td.times.map((time) => (
                      <div key={time.titulo}>
                        <p className="text-sm font-semibold text-texto-fraco">{time.titulo}</p>
                        <ul className="text-sm">
                          {time.lados.map((lado, i) => (
                            <LinhaLado key={i} lado={lado} />
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LinhaLado({ lado }: { lado: LadoLog }) {
  return (
    <li>
      <span className="text-texto-fraco">{lado.rotulo}:</span> {lado.nome}
      {lado.qualificador && ` (${lado.qualificador})`}
    </li>
  );
}

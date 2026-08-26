'use client';

import { useState, useTransition } from 'react';
import { confirmarNotificacaoAction } from './notificacoes-actions';

/** Mesmo estilo visual do aviso de "turno vazio" já existente na Home —
 * confirma no banco e some só pra este cartão (otimista, sem esperar um
 * novo carregamento da página). */
export function NotificacaoCard({
  id,
  mensagem,
  rotuloBotao,
}: {
  id: string;
  mensagem: string;
  rotuloBotao: string;
}) {
  const [sumiu, setSumiu] = useState(false);
  const [pendente, executar] = useTransition();

  if (sumiu) return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
      <span>{mensagem}</span>
      <button
        type="button"
        disabled={pendente}
        onClick={() =>
          executar(async () => {
            await confirmarNotificacaoAction(id);
            setSumiu(true);
          })
        }
        className="shrink-0 rounded-md border border-amber-400/50 px-2 py-1 text-xs font-medium hover:bg-amber-400/20 disabled:opacity-50"
      >
        {rotuloBotao}
      </button>
    </div>
  );
}

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
  const [erro, setErro] = useState<string | null>(null);

  if (sumiu) return null;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
        <span>{mensagem}</span>
        <button
          type="button"
          disabled={pendente}
          onClick={() =>
            executar(async () => {
              setErro(null);
              try {
                await confirmarNotificacaoAction(id);
                setSumiu(true);
              } catch {
                setErro('Não deu para confirmar.');
              }
            })
          }
          className="shrink-0 rounded-md border border-amber-400/50 px-2 py-1 text-xs font-medium hover:bg-amber-400/20 disabled:opacity-50"
        >
          {rotuloBotao}
        </button>
      </div>
      {erro && <p className="text-xs text-red-400">{erro}</p>}
    </div>
  );
}

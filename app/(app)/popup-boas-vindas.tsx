'use client';

import { useState, useTransition } from 'react';
import { confirmarNotificacaoAction } from './notificacoes-actions';

type Popup = { id: string; mensagem: string };

/** Mostra um popup de cada vez, do mais antigo pro mais novo (a fila já vem
 * ordenada do servidor) — "Fechar" confirma no banco e avança pro próximo,
 * sem esperar recarregar a página. */
export function PopupBoasVindas({ popups }: { popups: Popup[] }) {
  const [indice, setIndice] = useState(0);
  const [pendente, executar] = useTransition();

  if (indice >= popups.length) return null;
  const popup = popups[indice];

  function fechar() {
    executar(async () => {
      await confirmarNotificacaoAction(popup.id);
      setIndice((i) => i + 1);
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-borda bg-superficie p-6 text-center shadow-2xl">
        <p className="whitespace-pre-wrap text-sm">{popup.mensagem}</p>
        <button
          type="button"
          disabled={pendente}
          onClick={fechar}
          className="mt-5 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-fundo transition hover:bg-accent-forte disabled:opacity-50"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}

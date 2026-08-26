'use client';

import { useState, useTransition } from 'react';
import { confirmarNotificacaoAction } from './notificacoes-actions';

type Popup = { id: string; mensagem: string };

/** Mostra um popup de cada vez, do mais antigo pro mais novo. A fila é
 * congelada na primeira renderização (useState(popups) só roda uma vez) —
 * confirmarNotificacaoAction() chama revalidatePath('/'), que troca a prop
 * `popups` (o confirmado já não vem mais), mas o componente não desmonta;
 * se o "próximo a mostrar" fosse calculado indexando essa prop, um popup do
 * meio da fila seria pulado a cada confirmação. Por isso o controle de "o
 * que já foi fechado" é local (Set de ids), não depende do tamanho da lista
 * vinda do servidor. */
export function PopupBoasVindas({ popups }: { popups: Popup[] }) {
  const [filaOriginal] = useState(popups);
  const [fechados, setFechados] = useState<Set<string>>(new Set());
  const [pendente, executar] = useTransition();

  const popup = filaOriginal.find((p) => !fechados.has(p.id));
  if (!popup) return null;

  function fechar() {
    if (!popup) return;
    const popupId = popup.id;
    executar(async () => {
      await confirmarNotificacaoAction(popupId);
      setFechados((atual) => new Set(atual).add(popupId));
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

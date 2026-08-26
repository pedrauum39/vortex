'use client';

import { useState, useTransition } from 'react';
import { ROTULO_CONFIRMAR } from '@/lib/notificacoes';
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
  const [erro, setErro] = useState<string | null>(null);

  const popup = filaOriginal.find((p) => !fechados.has(p.id));
  if (!popup) return null;

  function fechar() {
    if (!popup) return;
    const popupId = popup.id;
    setErro(null);
    executar(async () => {
      try {
        await confirmarNotificacaoAction(popupId);
        setFechados((atual) => new Set(atual).add(popupId));
      } catch {
        setErro('Não deu para confirmar. Tenta de novo.');
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[85dvh] w-full max-w-sm overflow-y-auto rounded-2xl border border-borda bg-superficie p-6 text-center shadow-2xl">
        <p className="whitespace-pre-wrap text-sm">{popup.mensagem}</p>
        <button
          type="button"
          disabled={pendente}
          onClick={fechar}
          className="mt-5 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-fundo transition hover:bg-accent-forte disabled:opacity-50"
        >
          {ROTULO_CONFIRMAR.popup}
        </button>
        {erro && <p className="mt-2 text-xs text-red-400">{erro}</p>}
      </div>
    </div>
  );
}

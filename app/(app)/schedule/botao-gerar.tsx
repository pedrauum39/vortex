'use client';

import { useTransition } from 'react';
import { gerarEscalaDoPeriodo } from './actions';

export function BotaoGerar({ inicio, fim }: { inicio: string; fim: string }) {
  const [gerando, iniciar] = useTransition();

  return (
    <button
      type="button"
      disabled={gerando}
      onClick={() => iniciar(() => gerarEscalaDoPeriodo(inicio, fim))}
      className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-fundo transition hover:bg-accent-forte disabled:opacity-50"
    >
      {gerando ? 'Gerando…' : 'Gerar escala deste período'}
    </button>
  );
}

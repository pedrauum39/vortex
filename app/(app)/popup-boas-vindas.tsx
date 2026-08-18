'use client';

import { useEffect, useState } from 'react';

const CHAVE = 'vortex-popup-obrigado-pedro-v1';

export function PopupBoasVindas() {
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(CHAVE)) setAberto(true);
  }, []);

  function fechar() {
    localStorage.setItem(CHAVE, '1');
    setAberto(false);
  }

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-borda bg-superficie p-6 text-center shadow-2xl">
        <p className="text-lg font-medium">Oi, o Pedro ama vc tá?</p>
        <p className="mt-2 text-sm text-texto-fraco">
          Obrigado pela dedicação e vamos por mais juntos.
        </p>
        <button
          type="button"
          onClick={fechar}
          className="mt-5 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-fundo transition hover:bg-accent-forte"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}

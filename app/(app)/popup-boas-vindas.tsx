'use client';

import { useState, useSyncExternalStore } from 'react';

const CHAVE = 'vortex-popup-obrigado-pedro-v1';

const semInscricao = () => () => {};

export function PopupBoasVindas() {
  // useSyncExternalStore, não useState+useEffect: localStorage é um "external
  // store" de verdade — este é o jeito suportado de ler sem cair no anti-
  // padrão de setState síncrono dentro de efeito (react-hooks/set-state-in-
  // effect) e sem descasar servidor/cliente na hidratação. `subscribe` nunca
  // reinvoca o callback (nada externo muda o localStorage em outra aba nesse
  // caso), então o clique em "Fechar" usa um useState local só pra sumir na
  // hora, sem esperar um novo ciclo de leitura do storage.
  const jaViu = useSyncExternalStore(
    semInscricao,
    () => localStorage.getItem(CHAVE) === '1',
    () => true,
  );
  const [fechada, setFechada] = useState(false);

  if (jaViu || fechada) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-borda bg-superficie p-6 text-center shadow-2xl">
        <p className="text-lg font-medium">Oi, o Pedro ama vc tá?</p>
        <p className="mt-2 text-sm text-texto-fraco">
          Obrigado pela dedicação e vamos por mais juntos.
        </p>
        <button
          type="button"
          onClick={() => {
            localStorage.setItem(CHAVE, '1');
            setFechada(true);
          }}
          className="mt-5 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-fundo transition hover:bg-accent-forte"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}

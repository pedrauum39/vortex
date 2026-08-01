'use client';

import Link from 'next/link';
import { useState } from 'react';

export function CartaoInvoice({ valor }: { valor: string }) {
  const [visivel, setVisivel] = useState(false);

  return (
    <div className="rounded-2xl border border-borda bg-superficie p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-texto-fraco">Invoice do período atual</p>
        <button
          type="button"
          onClick={() => setVisivel((v) => !v)}
          aria-label={visivel ? 'Esconder valor do invoice' : 'Mostrar valor do invoice'}
          className="shrink-0 text-texto-fraco hover:text-texto"
        >
          {visivel ? <IconeOlhoAberto /> : <IconeOlhoFechado />}
        </button>
      </div>
      <p className="mt-1 text-2xl font-semibold tracking-widest">{visivel ? valor : '••••••'}</p>
      <Link
        href="/invoice"
        className="mt-3 inline-block rounded-lg border border-borda px-3 py-1.5 text-xs text-accent hover:bg-accent-fraco"
      >
        Ir até o invoice →
      </Link>
    </div>
  );
}

function IconeOlhoAberto() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconeOlhoFechado() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
      <path
        d="M9.9 4.24A10.9 10.9 0 0 1 12 4c7 0 11 8 11 8a18.6 18.6 0 0 1-3.22 4.31M6.1 6.1A18.6 18.6 0 0 0 1 12s4 8 11 8a10.9 10.9 0 0 0 5-1.17M3 3l18 18"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

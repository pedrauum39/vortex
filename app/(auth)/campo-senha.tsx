'use client';

import { useState } from 'react';

export function CampoSenha({
  id,
  value,
  onChange,
  minLength,
}: {
  id: string;
  value: string;
  onChange: (valor: string) => void;
  minLength?: number;
}) {
  const [visivel, setVisivel] = useState(false);

  return (
    <div className="relative mt-1.5">
      <input
        id={id}
        type={visivel ? 'text' : 'password'}
        required
        minLength={minLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-borda bg-fundo px-3 py-2.5 pr-10 text-sm outline-none focus:border-accent"
      />
      <button
        type="button"
        onClick={() => setVisivel((v) => !v)}
        aria-label={visivel ? 'Esconder senha' : 'Mostrar senha'}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-texto-fraco hover:text-texto"
      >
        {visivel ? <IconeOlhoAberto /> : <IconeOlhoFechado />}
      </button>
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

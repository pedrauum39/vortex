'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ABAS = [
  { href: '/admin/turnos', rotulo: 'Turnos' },
  { href: '/admin/reps', rotulo: 'Reps' },
  { href: '/admin/models', rotulo: 'Modelos' },
];

export function AdminNav() {
  const atual = usePathname();

  return (
    <nav className="flex gap-1 border-b border-borda">
      {ABAS.map(({ href, rotulo }) => {
        const ativo = atual.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`rounded-t-lg border-b-2 px-4 py-2 text-sm transition ${
              ativo
                ? 'border-accent text-accent'
                : 'border-transparent text-texto-fraco hover:bg-superficie-alta hover:text-texto'
            }`}
          >
            {rotulo}
          </Link>
        );
      })}
    </nav>
  );
}

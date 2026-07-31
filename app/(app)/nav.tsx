'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ROTAS = [
  { href: '/', rotulo: 'Início' },
  { href: '/schedule', rotulo: 'Schedule' },
  { href: '/turno', rotulo: 'Turno' },
  { href: '/invoice', rotulo: 'Invoice' },
];

export function Nav({ admin }: { admin: boolean }) {
  const atual = usePathname();
  const rotas = admin ? [...ROTAS, { href: '/admin', rotulo: 'Admin' }] : ROTAS;

  return (
    <nav className="flex gap-1">
      {rotas.map(({ href, rotulo }) => {
        const ativo = href === '/' ? atual === '/' : atual.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`rounded-lg px-3 py-1.5 text-sm transition ${
              ativo
                ? 'bg-accent-fraco text-accent'
                : 'text-texto-fraco hover:bg-superficie-alta hover:text-texto'
            }`}
          >
            {rotulo}
          </Link>
        );
      })}
    </nav>
  );
}

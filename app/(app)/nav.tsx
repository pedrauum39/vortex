'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ROTAS = [
  { href: '/', rotulo: 'Início' },
  { href: '/schedule', rotulo: 'Schedule' },
  { href: '/turno', rotulo: 'Turnos' },
  { href: '/invoice', rotulo: 'Invoice' },
];

export function Nav({ admin, primaris }: { admin: boolean; primaris: boolean }) {
  const atual = usePathname();
  const rotas = primaris ? [...ROTAS, { href: '/primaris', rotulo: 'Primaris' }] : ROTAS;
  const rotasFinais = admin ? [...rotas, { href: '/admin', rotulo: 'Admin' }] : rotas;

  return (
    <nav className="flex gap-1">
      {rotasFinais.map(({ href, rotulo }) => {
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

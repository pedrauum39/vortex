import Image from 'next/image';
import Link from 'next/link';
import { ehAdmin, exigirRep } from '@/lib/auth';
import { rotuloTurno } from '@/lib/tipos';
import { Nav } from './nav';

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const rep = await exigirRep();

  return (
    <div className="relative flex min-h-dvh flex-col">
      <header className="border-b border-borda bg-superficie/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <Link
            href="/"
            className="flex items-center gap-2 text-lg font-semibold tracking-tight text-accent"
          >
            <Image src="/vortex-logo.png" alt="" width={48} height={48} className="rounded-full" />
            VORTEX
          </Link>
          <Nav
            admin={ehAdmin(rep)}
            primaris={rep.cargo === 'grand_primaris' || rep.cargo === 'knight_primaris'}
          />
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-texto-fraco sm:block">
              {rep.nome_curto} · {rotuloTurno(rep.turno)}
            </span>
            <form action="/auth/sair" method="post">
              <button
                type="submit"
                className="rounded-lg border border-borda px-3 py-1.5 text-sm text-texto-fraco transition hover:border-accent hover:text-texto"
              >
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}

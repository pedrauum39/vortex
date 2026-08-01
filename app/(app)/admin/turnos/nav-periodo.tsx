import Link from 'next/link';
import { diaLegivel, somarDias } from '@/lib/tempo';

export function NavPeriodo({ inicio, fim }: { inicio: string; fim: string }) {
  return (
    <div className="flex items-center gap-1 text-sm">
      <Link
        href={`/admin/turnos?de=${somarDias(inicio, -7)}`}
        className="rounded-lg border border-borda px-2.5 py-1.5 text-texto-fraco hover:text-texto"
      >
        ←
      </Link>
      <span className="px-2 text-texto-fraco">
        {diaLegivel(inicio)} – {diaLegivel(fim)}
      </span>
      <Link
        href={`/admin/turnos?de=${somarDias(inicio, 7)}`}
        className="rounded-lg border border-borda px-2.5 py-1.5 text-texto-fraco hover:text-texto"
      >
        →
      </Link>
    </div>
  );
}

import type { CorMeta } from '@/lib/meta';

export const CORES: Record<CorMeta, string> = {
  vermelho: 'text-red-400',
  amarelo: 'text-amber-300',
  verde: 'text-green-400',
  'azul-neon': 'text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.75)]',
};

const dinheiro = (valor: number) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });

/** Barra "vendido / meta" com o percentual — usada em /primaris e na home. */
export function BarraMeta({
  vendido,
  meta,
  percentual,
  compacta,
}: {
  vendido: number;
  meta: number;
  percentual: number | null;
  compacta?: boolean;
}) {
  const largura = percentual === null ? 0 : Math.min(100, Math.max(0, percentual));

  return (
    <div className={compacta ? 'min-w-[14rem]' : ''}>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-texto-fraco">
          {dinheiro(vendido)} / {dinheiro(meta)}
        </span>
        <span className="font-semibold">{percentual === null ? '—' : `${percentual.toFixed(1)}%`}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-superficie-alta">
        <div className="h-full rounded-full bg-accent" style={{ width: `${largura}%` }} />
      </div>
    </div>
  );
}

export function IconeRaio({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M13 2 3 14h7l-1 8 11-14h-7l0-6Z" />
    </svg>
  );
}

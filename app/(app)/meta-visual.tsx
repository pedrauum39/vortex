import type { CorMeta } from '@/lib/meta';

export const CORES: Record<CorMeta, string> = {
  vermelho: 'text-red-400',
  amarelo: 'text-amber-300',
  verde: 'text-green-400',
  'azul-neon': 'text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.75)]',
};

export function IconeRaio({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M13 2 3 14h7l-1 8 11-14h-7l0-6Z" />
    </svg>
  );
}

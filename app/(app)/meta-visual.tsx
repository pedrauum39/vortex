import Image from 'next/image';
import type { CorMeta } from '@/lib/meta';

export const CORES: Record<CorMeta, string> = {
  vermelho: 'text-red-400',
  amarelo: 'text-amber-300',
  verde: 'text-green-400',
  'azul-neon': 'text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.75)]',
};

const dinheiro = (valor: number) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });

const pct = (percentual: number | null) => (percentual === null ? '—' : `${percentual.toFixed(1)}%`);

/** Linha "rótulo · vendido / meta · %", sem barra — pra listar cada modelo
 *  debaixo do time. */
export function LinhaMeta({
  rotulo,
  vendido,
  meta,
  percentual,
}: {
  rotulo: string;
  vendido: number;
  meta: number;
  percentual: number | null;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs text-texto-fraco">
      <span>{rotulo}</span>
      <span>
        {dinheiro(vendido)} / {dinheiro(meta)} <span className="font-semibold text-texto">{pct(percentual)}</span>
      </span>
    </div>
  );
}

/** Barra "vendido / meta" com o percentual — usada em /primaris e na home.
 *  Com `rotulo`, prefixa a linha (ex.: "Vortex · US$ … / US$ …"). */
export function BarraMeta({
  vendido,
  meta,
  percentual,
  compacta,
  rotulo,
  logo,
}: {
  vendido: number;
  meta: number;
  percentual: number | null;
  compacta?: boolean;
  rotulo?: string;
  /** Mostra o logo do Vortex antes do rótulo. */
  logo?: boolean;
}) {
  const largura = percentual === null ? 0 : Math.min(100, Math.max(0, percentual));

  return (
    <div className={compacta ? 'min-w-[14rem]' : ''}>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-texto-fraco">
          {rotulo && (
            <span className="mr-1 inline-flex items-center gap-1 font-medium text-texto">
              {logo && (
                <Image src="/vortex-logo.png" alt="" width={16} height={16} className="rounded-full" />
              )}
              {rotulo} ·
            </span>
          )}
          {dinheiro(vendido)} / {dinheiro(meta)}
        </span>
        <span className="font-semibold">{pct(percentual)}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-superficie-alta">
        <div className="h-full rounded-full bg-accent" style={{ width: `${largura}%` }} />
      </div>
    </div>
  );
}

/** Barra "ela entrou com X, o time fez Y desde então" — vermelho = valor de
 *  entrada (net que ela já tinha, informativo), azul = gerado pelo time
 *  desde que ela entrou (soma de tudo já registrado). Sem meta/percentual —
 *  é sobre o total acumulado, não o mês corrente. Só renderiza quando há
 *  valor de entrada pra mostrar. */
export function BarraEntrada({ valorEntrada, gerado }: { valorEntrada: number; gerado: number }) {
  const total = valorEntrada + gerado;
  const larguraEntrada = total > 0 ? (valorEntrada / total) * 100 : 0;
  const larguraGerado = total > 0 ? (gerado / total) * 100 : 0;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-xs text-texto-fraco">
        <span>
          entrou com <span className="text-red-400">{dinheiro(valorEntrada)}</span> · time fez{' '}
          <span className="text-blue-400">{dinheiro(gerado)}</span>
        </span>
        <span className="font-semibold text-texto">{dinheiro(total)}</span>
      </div>
      <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-superficie-alta">
        <div className="h-full bg-red-400" style={{ width: `${larguraEntrada}%` }} />
        <div className="h-full bg-blue-400" style={{ width: `${larguraGerado}%` }} />
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

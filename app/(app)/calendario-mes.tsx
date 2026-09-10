'use client';

import Link from 'next/link';
import { useState } from 'react';
import { corDaMeta, temRaio, type CorMeta } from '@/lib/meta';
import { diasNoMes, mesLegivel } from '@/lib/tempo';
import type { Bloco } from '@/lib/tipos';
import { IconeRaio } from './meta-visual';

export type DiaDoCalendario = {
  trabalhado: boolean;
  percentual: number | null;
  bloco: Bloco;
  /** Modelos do turno (roster do time se ainda não trabalhou). */
  modelos: string;
};

const DIAS_SEMANA = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

// Mesma escala de corDaMeta, só que apagada — o calendário mostra 30+ dias de
// uma vez, cor viva em todo canto ficaria "muito baiano" (pedido do usuário).
const CORES_PASTEL: Record<CorMeta, string> = {
  vermelho: 'bg-red-500/10 text-red-300',
  amarelo: 'bg-amber-500/10 text-amber-200',
  verde: 'bg-green-500/10 text-green-300',
  'azul-neon': 'bg-cyan-500/10 text-cyan-200',
};

/** Grade do mês, uma célula por dia (null nas células de padding antes do dia 1). Semana começa na segunda. */
function gradeDoMes(mes: string): (string | null)[] {
  const [ano, m] = mes.split('-').map(Number);
  const diaSemana1 = new Date(Date.UTC(ano, m - 1, 1)).getUTCDay();
  const offset = (diaSemana1 + 6) % 7;
  const total = diasNoMes(mes);
  const celulas: (string | null)[] = Array(offset).fill(null);
  for (let dia = 1; dia <= total; dia++) {
    celulas.push(`${mes}-${String(dia).padStart(2, '0')}`);
  }
  return celulas;
}

/**
 * Calendário do mês do rep — dias com turno em azul, dias já feitos na cor
 * (apagada) da meta atingida. Parar o mouse num dia com turno mostra uma
 * caixinha com o time e as modelos daquele turno. `onDiaHover` deixa o
 * chamador (ex.: a lista de "Meus turnos") reagir ao hover também.
 */
export function CalendarioMes({
  mesCal,
  hoje,
  diasInfo,
  mesAnteriorHref,
  mesSeguinteHref,
  onDiaHover,
}: {
  mesCal: string;
  hoje: string;
  diasInfo: Record<string, DiaDoCalendario>;
  mesAnteriorHref: string;
  mesSeguinteHref: string;
  onDiaHover?: (data: string | null) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const grade = gradeDoMes(mesCal);

  const mudarHover = (data: string | null) => {
    setHover(data);
    onDiaHover?.(data);
  };

  return (
    <div className="rounded-2xl border border-borda bg-superficie p-4">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-medium capitalize text-texto-fraco">{mesLegivel(mesCal)}</h3>
        <div className="ml-auto flex items-center gap-1 text-sm">
          <Link
            href={mesAnteriorHref}
            className="rounded-lg border border-borda px-2 py-1 text-texto-fraco hover:text-texto"
          >
            ←
          </Link>
          <Link
            href={mesSeguinteHref}
            className="rounded-lg border border-borda px-2 py-1 text-texto-fraco hover:text-texto"
          >
            →
          </Link>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs text-texto-fraco">
        {DIAS_SEMANA.map((d) => (
          <div key={d} className="py-0.5">
            {d}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {grade.map((data, i) => {
          if (!data) return <div key={`vazio-${i}`} />;
          const info = diasInfo[data];
          const temTurno = !!info;
          const ehHoje = data === hoje;
          const dia = Number(data.slice(-2));

          const jaFeito = info?.trabalhado && info.percentual !== null;
          const cor = jaFeito ? corDaMeta(info!.percentual!) : null;
          const raio = jaFeito && temRaio(info!.percentual!);

          return (
            <div
              key={data}
              onMouseEnter={() => temTurno && mudarHover(data)}
              onMouseLeave={() => mudarHover(null)}
              className={`relative flex aspect-square items-center justify-center rounded-lg text-lg font-medium transition ${
                cor
                  ? `cursor-default ${CORES_PASTEL[cor]}`
                  : temTurno
                    ? 'cursor-default bg-accent-fraco text-accent'
                    : 'text-texto-fraco'
              } ${ehHoje ? 'ring-2 ring-accent' : ''}`}
            >
              {jaFeito && (
                <span className="absolute left-1 top-1 flex items-center gap-0.5 text-xs font-normal leading-none opacity-90">
                  {info!.percentual!.toFixed(0)}%
                  {raio && <IconeRaio className="size-3" />}
                </span>
              )}
              {dia}
              {temTurno && hover === data && (
                <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 w-max max-w-[13rem] -translate-x-1/2 rounded-lg bg-accent px-2.5 py-1.5 text-xs font-medium text-fundo shadow-lg">
                  Time {info!.bloco === 'I' ? '1' : '2'} · {info!.modelos}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

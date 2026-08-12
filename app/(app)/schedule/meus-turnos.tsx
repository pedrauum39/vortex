'use client';

import { useState } from 'react';
import Link from 'next/link';
import { corDaMeta, temRaio, type CorMeta } from '@/lib/meta';
import { diaLegivel, diasNoMes, mesLegivel } from '@/lib/tempo';
import { rotuloTurno, type Bloco, type Turno } from '@/lib/tipos';
import { BotaoGerar } from './botao-gerar';
import { IconeRaio } from '../meta-visual';

export type MeuTurno = {
  id: string;
  data: string;
  turno: Turno;
  bloco: Bloco;
  funcao: 'regular' | 'assist';
  origem: 'gerado' | 'manual';
  shift_logs: {
    clock_in_at: string;
    clock_out_at: string | null;
    shift_log_models: { models: { nome: string } }[];
  }[];
};

export type DiaDoCalendario = {
  trabalhado: boolean;
  percentual: number | null;
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

export function MeusTurnos({
  turnos,
  rosterPorBloco,
  hoje,
  admin,
  inicio,
  fim,
  mesCal,
  diasInfo,
  mesAnteriorHref,
  mesSeguinteHref,
}: {
  turnos: MeuTurno[];
  rosterPorBloco: Record<string, string>;
  hoje: string;
  admin: boolean;
  inicio: string;
  fim: string;
  mesCal: string;
  diasInfo: Record<string, DiaDoCalendario>;
  mesAnteriorHref: string;
  mesSeguinteHref: string;
}) {
  const [diaHover, setDiaHover] = useState<string | null>(null);
  const grade = gradeDoMes(mesCal);

  return (
    <div className="space-y-6">
      {turnos.length === 0 ? (
        <Vazia admin={admin} inicio={inicio} fim={fim} />
      ) : (
        <ul className="divide-y divide-borda rounded-2xl border border-borda bg-superficie">
          {turnos.map((t) => {
            const log = t.shift_logs[0];
            const modelos = log?.shift_log_models.map((m) => m.models.nome).join(' + ');
            const destacado = diaHover !== null && t.data === diaHover;
            return (
              <li
                key={t.id}
                className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-6 py-4 text-base transition ${
                  destacado ? 'ring-2 ring-inset ring-accent shadow-[0_0_16px_rgba(56,189,248,0.45)]' : ''
                }`}
              >
                <span className={t.data === hoje ? 'font-medium text-accent' : ''}>
                  {diaLegivel(t.data)}
                </span>
                <span className="text-texto-fraco">{rotuloTurno(t.turno)}</span>
                <span className="text-accent">
                  {modelos || rosterPorBloco[t.bloco] || `Bloco ${t.bloco}`}
                </span>
                {t.funcao === 'assist' && (
                  <span className="rounded-md bg-accent-fraco px-2 py-0.5 text-sm text-accent">
                    Assistant
                  </span>
                )}
                {t.origem === 'manual' && (
                  <span className="rounded-md border border-borda px-2 py-0.5 text-sm text-texto-fraco">
                    alterado
                  </span>
                )}
                <span className="ml-auto text-sm text-texto-fraco">
                  {log?.clock_out_at
                    ? 'concluído'
                    : log
                      ? 'em andamento'
                      : t.data < hoje
                        ? 'sem registro'
                        : ''}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mx-auto w-full max-w-[40rem] rounded-2xl border border-borda bg-superficie p-4">
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

            // Turno já feito e com meta configurada: cor pastel da faixa
            // atingida (igual Home/histórico de turnos, só que apagada — o
            // mês inteiro à mostra de uma vez fica "muito baiano" em cor viva).
            const jaFeito = info?.trabalhado && info.percentual !== null;
            const cor = jaFeito ? corDaMeta(info!.percentual!) : null;
            const raio = jaFeito && temRaio(info!.percentual!);

            return (
              <div
                key={data}
                onMouseEnter={() => temTurno && setDiaHover(data)}
                onMouseLeave={() => setDiaHover(null)}
                className={`relative flex aspect-square items-center justify-center rounded-lg text-sm transition ${
                  cor
                    ? `cursor-default ${CORES_PASTEL[cor]}`
                    : temTurno
                      ? 'cursor-default bg-accent-fraco text-accent'
                      : 'text-texto-fraco'
                } ${ehHoje ? 'ring-2 ring-accent' : ''}`}
              >
                {jaFeito && (
                  <span className="absolute left-1 top-1 flex items-center gap-0.5 text-[8px] leading-none opacity-90">
                    {info!.percentual!.toFixed(0)}%
                    {raio && <IconeRaio className="size-2" />}
                  </span>
                )}
                {dia}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Vazia({ admin, inicio, fim }: { admin: boolean; inicio: string; fim: string }) {
  return (
    <div className="rounded-2xl border border-borda bg-superficie p-10 text-center">
      <p className="text-texto-fraco">Nenhum turno gravado neste período.</p>
      {admin ? (
        <div className="mt-4">
          <BotaoGerar inicio={inicio} fim={fim} />
        </div>
      ) : (
        <p className="mt-2 text-sm text-texto-fraco">Peça ao admin para gerar a escala.</p>
      )}
    </div>
  );
}

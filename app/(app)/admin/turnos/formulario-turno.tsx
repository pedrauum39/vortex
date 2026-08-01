'use client';

import { useState, useTransition } from 'react';
import { TURNOS, rotuloTurno, type Bloco, type Funcao, type Rep } from '@/lib/tipos';
import { criarTurno } from './actions';

const campo =
  'rounded-lg border border-borda bg-fundo px-2.5 py-2 text-sm outline-none focus:border-accent';

export function FormularioTurno({ reps, inicio }: { reps: Rep[]; inicio: string }) {
  const [data, setData] = useState(inicio);
  const [turno, setTurno] = useState<(typeof TURNOS)[number]>('T2T3');
  const [bloco, setBloco] = useState<Bloco>('I');
  const [funcao, setFuncao] = useState<Funcao>('regular');
  const [repId, setRepId] = useState(reps[0]?.id ?? '');
  const [pendente, executar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  function criar() {
    if (!repId) return;
    executar(async () => {
      setErro(null);
      setOk(false);
      try {
        await criarTurno({ data, turno, bloco, funcao, repId });
        setOk(true);
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não deu para criar.');
      }
    });
  }

  return (
    <div className="rounded-2xl border border-borda bg-superficie p-4">
      <p className="text-sm font-medium">Criar / atualizar turno</p>
      <p className="mt-1 text-xs text-texto-fraco">
        Grava com origem manual — vence o que gerarEscala() geraria no mesmo slot.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-texto-fraco">
          Data
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={campo} />
        </label>

        <label className="flex flex-col gap-1 text-xs text-texto-fraco">
          Turno
          <select value={turno} onChange={(e) => setTurno(e.target.value as never)} className={campo}>
            {TURNOS.map((t) => (
              <option key={t} value={t}>
                {rotuloTurno(t)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-texto-fraco">
          Bloco
          <select value={bloco} onChange={(e) => setBloco(e.target.value as Bloco)} className={campo}>
            <option value="I">I (Time 1)</option>
            <option value="II">II (Time 2)</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-texto-fraco">
          Função
          <select value={funcao} onChange={(e) => setFuncao(e.target.value as Funcao)} className={campo}>
            <option value="regular">Regular</option>
            <option value="assist">Assistant</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-texto-fraco">
          Rep
          <select value={repId} onChange={(e) => setRepId(e.target.value)} className={`${campo} max-w-[12rem]`}>
            {reps.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome_curto} · {rotuloTurno(r.turno)}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          disabled={pendente || !repId}
          onClick={criar}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-fundo transition hover:bg-accent-forte disabled:opacity-50"
        >
          {pendente ? 'Gravando…' : 'Criar turno'}
        </button>

        {ok && <span className="text-xs text-accent">gravado ✓</span>}
        {erro && <span className="text-xs text-red-400">{erro}</span>}
      </div>
    </div>
  );
}

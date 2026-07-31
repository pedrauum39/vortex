'use client';

import { useState, useTransition } from 'react';
import type { Model } from '@/lib/tipos';
import { finalizarTurno, iniciarTurno, trocarModelo } from './actions';

type Props = {
  turno: { id: string; modelo: string; modelId: string | null; assist: boolean };
  log: { id: string; entrada: string; saida: string | null; modelIdReal: string | null } | null;
  models: Model[];
};

export function Painel({ turno, log, models }: Props) {
  const [pendente, executar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [modelo, setModelo] = useState(log?.modelIdReal ?? turno.modelId ?? '');
  const [saiuAntes, setSaiuAntes] = useState(false);
  const [motivo, setMotivo] = useState('');

  const rodar = (acao: () => Promise<void>) =>
    executar(async () => {
      setErro(null);
      try {
        await acao();
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não deu para gravar.');
      }
    });

  return (
    <section className="rounded-2xl border border-borda bg-superficie p-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xl font-medium">{turno.modelo}</span>
        {turno.assist && (
          <span className="rounded-md bg-accent-fraco px-2 py-0.5 text-sm text-accent">
            Assistant
          </span>
        )}
        {log && (
          <span className="ml-auto text-sm text-texto-fraco">
            entrada {log.entrada}
            {log.saida && ` · saída ${log.saida}`}
          </span>
        )}
      </div>

      {!log?.saida && (
        <div className="mt-6">
          <label className="block text-sm text-texto-fraco" htmlFor="modelo">
            Modelo trabalhada
          </label>
          <select
            id="modelo"
            value={modelo}
            onChange={(e) => {
              setModelo(e.target.value);
              if (log) rodar(() => trocarModelo(log.id, e.target.value || null));
            }}
            className="mt-1.5 w-full max-w-xs rounded-lg border border-borda bg-fundo px-3 py-2.5 text-sm outline-none focus:border-accent"
          >
            <option value="">—</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-texto-fraco">
            Trocar aqui registra a modelo real do turno. Não altera o schedule.
          </p>
        </div>
      )}

      {!log && (
        <button
          type="button"
          disabled={pendente}
          onClick={() => rodar(() => iniciarTurno(turno.id, modelo || null))}
          className="mt-6 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-fundo transition hover:bg-accent-forte disabled:opacity-50"
        >
          {pendente ? 'Iniciando…' : 'Iniciar turno'}
        </button>
      )}

      {log && !log.saida && (
        <div className="mt-6 border-t border-borda pt-6">
          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={saiuAntes}
              onChange={(e) => setSaiuAntes(e.target.checked)}
              className="size-4 accent-[var(--color-accent)]"
            />
            Finalizei antes da hora
          </label>

          {saiuAntes && (
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Motivo da saída antecipada"
              rows={2}
              className="mt-3 w-full rounded-lg border border-borda bg-fundo px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
          )}

          <button
            type="button"
            disabled={pendente || (saiuAntes && motivo.trim() === '')}
            onClick={() =>
              rodar(() => finalizarTurno(log.id, { saiuAntes, motivoSaida: motivo.trim() || null }))
            }
            className="mt-4 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-fundo transition hover:bg-accent-forte disabled:opacity-50"
          >
            {pendente ? 'Finalizando…' : 'Finalizar turno'}
          </button>
        </div>
      )}

      {log?.saida && (
        <p className="mt-6 border-t border-borda pt-6 text-sm text-texto-fraco">
          Turno concluído às {log.saida}.
        </p>
      )}

      {erro && <p className="mt-4 text-sm text-red-400">{erro}</p>}
    </section>
  );
}

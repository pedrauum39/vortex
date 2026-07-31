'use client';

import { useState, useTransition } from 'react';
import type { Model } from '@/lib/tipos';
import { iniciarTurno, trocarModelo } from './actions';
import { ModalReport } from './modal-report';

type Props = {
  turno: { id: string; modelo: string; modelId: string | null; assist: boolean };
  log: { id: string; entrada: string; saida: string | null; modelIdReal: string | null } | null;
  models: Model[];
  repId: string;
};

export function Painel({ turno, log, models, repId }: Props) {
  const [pendente, executar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [modelo, setModelo] = useState(log?.modelIdReal ?? turno.modelId ?? '');
  const [fechando, setFechando] = useState(false);

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
          <button
            type="button"
            onClick={() => setFechando(true)}
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-fundo transition hover:bg-accent-forte"
          >
            Finalizar turno
          </button>

          {fechando && (
            <ModalReport
              logId={log.id}
              shiftId={turno.id}
              repId={repId}
              aoFechar={() => setFechando(false)}
            />
          )}
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

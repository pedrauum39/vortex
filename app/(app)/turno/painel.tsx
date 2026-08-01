'use client';

import { useState, useTransition } from 'react';
import type { Bloco, Model } from '@/lib/tipos';
import { iniciarTurno, trocarModelos } from './actions';
import { ModalReport } from './modal-report';

type Props = {
  turno: { id: string; bloco: Bloco; assist: boolean };
  log: {
    id: string;
    entrada: string;
    saida: string | null;
    modelos: { id: string; nome: string }[];
    horas: number;
  } | null;
  models: Model[];
  repId: string;
  podeIniciar: boolean;
  abreAs: string;
};

export function Painel({ turno, log, models, repId, podeIniciar, abreAs }: Props) {
  const [pendente, executar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  // Sem log ainda, começa com o roster padrão do time todo marcado — o rep
  // desmarca quem não fez e marca quem fez fora do padrão.
  const [selecionados, setSelecionados] = useState<string[]>(
    log?.modelos.map((m) => m.id) ?? models.map((m) => m.id),
  );
  const [editandoModelos, setEditandoModelos] = useState(false);
  const [fechando, setFechando] = useState(false);

  const rodar = (acao: () => Promise<void>) =>
    executar(async () => {
      setErro(null);
      try {
        await acao();
        setEditandoModelos(false);
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não deu para gravar.');
      }
    });

  function alternar(id: string) {
    setSelecionados((atual) =>
      atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id],
    );
  }

  return (
    <section className="rounded-2xl border border-borda bg-superficie p-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xl font-medium">
          {log ? log.modelos.map((m) => m.nome).join(' + ') : `Bloco ${turno.bloco}`}
        </span>
        {log && log.modelos.length > 1 && (
          <span className="rounded-md bg-accent-fraco px-2 py-0.5 text-sm text-accent">
            {log.modelos.length === 2 ? 'Double' : `${log.modelos.length} modelos`}
          </span>
        )}
        {turno.assist && (
          <span className="rounded-md bg-accent-fraco px-2 py-0.5 text-sm text-accent">
            Assistant
          </span>
        )}
        {log && (
          <span className="ml-auto text-sm text-texto-fraco">
            entrada {log.entrada}
            {log.saida && ` · saída ${log.saida}`} · {log.horas.toFixed(2)}h
          </span>
        )}
      </div>

      {(!log || editandoModelos) && (
        <div className="mt-6">
          <p className="text-sm text-texto-fraco">
            Modelo{selecionados.length > 1 ? 's' : ''} trabalhada
            {selecionados.length > 1 ? 's' : ''}{' '}
            <span className="text-xs">(o padrão do time já vem marcado — ajuste se for diferente)</span>
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {models.map((m) => (
              <label
                key={m.id}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  selecionados.includes(m.id)
                    ? 'border-accent bg-accent-fraco text-accent'
                    : 'border-borda text-texto-fraco'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selecionados.includes(m.id)}
                  onChange={() => alternar(m.id)}
                  className="size-4 accent-[var(--color-accent)]"
                />
                {m.nome}
              </label>
            ))}
          </div>

          {editandoModelos && (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelecionados(log!.modelos.map((m) => m.id));
                  setEditandoModelos(false);
                }}
                className="rounded-lg border border-borda px-3 py-1.5 text-xs text-texto-fraco hover:text-texto"
              >
                cancelar
              </button>
              <button
                type="button"
                disabled={pendente || selecionados.length === 0}
                onClick={() => rodar(() => trocarModelos(log!.id, selecionados))}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-fundo hover:bg-accent-forte disabled:opacity-50"
              >
                salvar
              </button>
            </div>
          )}
        </div>
      )}

      {!log && (
        <div className="mt-6">
          <button
            type="button"
            disabled={pendente || !podeIniciar || selecionados.length === 0}
            onClick={() => rodar(() => iniciarTurno(turno.id, selecionados))}
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-fundo transition hover:bg-accent-forte disabled:opacity-40"
          >
            {pendente ? 'Iniciando…' : 'Iniciar turno'}
          </button>
          {!podeIniciar && (
            <p className="mt-2 text-sm text-texto-fraco">
              O ponto abre às {abreAs}, 15 minutos antes do turno.
            </p>
          )}
        </div>
      )}

      {log && !log.saida && !editandoModelos && (
        <button
          type="button"
          onClick={() => setEditandoModelos(true)}
          className="mt-3 text-xs text-accent hover:underline"
        >
          editar modelos
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
              modelos={log.modelos}
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

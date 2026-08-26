'use client';

import { useState, useTransition } from 'react';
import { ROTULO_TIPO, type TipoNotificacao } from '@/lib/notificacoes';
import { criarNotificacaoAction } from './actions';

const TIPOS: TipoNotificacao[] = ['popup', 'aviso', 'todo'];

export function FormNotificacao({ reps }: { reps: { id: string; nome_curto: string }[] }) {
  const [tipo, setTipo] = useState<TipoNotificacao>('aviso');
  const [mensagem, setMensagem] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [pendente, executar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function alternar(id: string) {
    setSelecionados((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));
  }

  function enviar() {
    executar(async () => {
      setErro(null);
      try {
        await criarNotificacaoAction({
          tipo,
          mensagem,
          dataInicio: tipo === 'aviso' ? dataInicio : null,
          dataFim: tipo === 'aviso' ? dataFim : null,
          repIds: selecionados,
        });
        setMensagem('');
        setDataInicio('');
        setDataFim('');
        setSelecionados([]);
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não deu para gravar.');
      }
    });
  }

  const podeEnviar =
    !pendente && mensagem.trim().length > 0 && selecionados.length > 0 && (tipo !== 'aviso' || (dataInicio && dataFim));

  return (
    <section className="rounded-2xl border border-borda bg-superficie p-6">
      <h2 className="text-lg font-medium">Nova notificação</h2>

      <div className="mt-4 flex gap-2">
        {TIPOS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTipo(t)}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              tipo === t ? 'border-accent bg-accent-fraco text-accent' : 'border-borda text-texto-fraco'
            }`}
          >
            {ROTULO_TIPO[t]}
          </button>
        ))}
      </div>

      <textarea
        value={mensagem}
        onChange={(e) => setMensagem(e.target.value)}
        placeholder="Mensagem"
        rows={3}
        className="mt-4 w-full rounded-lg border border-borda bg-fundo px-3 py-2.5 text-sm outline-none focus:border-accent"
      />

      {tipo === 'aviso' && (
        <div className="mt-3 flex gap-3">
          <label className="text-sm text-texto-fraco">
            De{' '}
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="ml-1 rounded-lg border border-borda bg-fundo px-2 py-1.5 text-sm outline-none focus:border-accent"
            />
          </label>
          <label className="text-sm text-texto-fraco">
            Até{' '}
            <input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="ml-1 rounded-lg border border-borda bg-fundo px-2 py-1.5 text-sm outline-none focus:border-accent"
            />
          </label>
        </div>
      )}

      <div className="mt-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-texto-fraco">Destinatários</p>
          <button
            type="button"
            onClick={() => setSelecionados(reps.map((r) => r.id))}
            className="text-xs text-accent hover:underline"
          >
            marcar todos
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {reps.map((r) => (
            <label
              key={r.id}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                selecionados.includes(r.id)
                  ? 'border-accent bg-accent-fraco text-accent'
                  : 'border-borda text-texto-fraco'
              }`}
            >
              <input
                type="checkbox"
                checked={selecionados.includes(r.id)}
                onChange={() => alternar(r.id)}
                className="size-4 accent-[var(--color-accent)]"
              />
              {r.nome_curto}
            </label>
          ))}
        </div>
      </div>

      {erro && <p className="mt-3 text-sm text-red-400">{erro}</p>}

      <button
        type="button"
        disabled={!podeEnviar}
        onClick={enviar}
        className="mt-4 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-fundo transition hover:bg-accent-forte disabled:opacity-50"
      >
        {pendente ? 'Enviando…' : 'Criar notificação'}
      </button>
    </section>
  );
}

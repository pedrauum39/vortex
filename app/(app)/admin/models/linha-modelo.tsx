'use client';

import { useState, useTransition } from 'react';
import type { Bloco, Model } from '@/lib/tipos';
import { apagarModelo, criarModelo, definirAtivaModelo, renomearModelo } from './actions';

export function LinhaModelo({ model }: { model: Model }) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(model.nome);
  const [pendente, executar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const rodar = (acao: () => Promise<void>) =>
    executar(async () => {
      setErro(null);
      try {
        await acao();
        setEditando(false);
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não deu.');
      }
    });

  return (
    <tr className={`border-b border-borda last:border-0 ${!model.ativa ? 'opacity-50' : ''}`}>
      <td className="px-4 py-2.5">
        {editando ? (
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="w-full rounded-lg border border-borda bg-fundo px-2 py-1.5 text-sm outline-none focus:border-accent"
            autoFocus
          />
        ) : (
          <>
            {model.nome}
            {!model.ativa && <span className="ml-2 text-xs text-texto-fraco">(inativa)</span>}
          </>
        )}
      </td>
      <td className="px-4 py-2.5 text-right">
        {erro && <span className="mr-2 text-xs text-red-400">{erro}</span>}
        {editando ? (
          <div className="inline-flex gap-2">
            <button
              type="button"
              onClick={() => {
                setNome(model.nome);
                setEditando(false);
              }}
              className="text-xs text-texto-fraco hover:text-texto"
            >
              cancelar
            </button>
            <button
              type="button"
              disabled={pendente}
              onClick={() => rodar(() => renomearModelo(model.id, nome))}
              className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-fundo hover:bg-accent-forte disabled:opacity-50"
            >
              salvar
            </button>
          </div>
        ) : (
          <div className="inline-flex gap-3">
            <button type="button" onClick={() => setEditando(true)} className="text-xs text-accent hover:underline">
              renomear
            </button>
            <button
              type="button"
              disabled={pendente}
              onClick={() => rodar(() => definirAtivaModelo(model.id, !model.ativa))}
              className="text-xs text-texto-fraco hover:text-texto disabled:opacity-50"
            >
              {model.ativa ? 'desativar' : 'reativar'}
            </button>
            <button
              type="button"
              disabled={pendente}
              onClick={() => {
                if (confirm(`Apagar "${model.nome}"? Turnos que usam essa modelo ficam sem modelo.`)) {
                  rodar(() => apagarModelo(model.id));
                }
              }}
              className="text-xs text-red-400 hover:underline disabled:opacity-50"
            >
              apagar
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

export function FormularioModelo({ bloco }: { bloco: Bloco }) {
  const [nome, setNome] = useState('');
  const [pendente, executar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function criar() {
    if (!nome.trim()) return;
    executar(async () => {
      setErro(null);
      try {
        await criarModelo(nome.trim(), bloco);
        setNome('');
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não deu para criar.');
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <input
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="Adicionar modelo a este time"
        className="w-full rounded-lg border border-borda bg-fundo px-3 py-2 text-sm outline-none focus:border-accent"
      />
      <button
        type="button"
        disabled={pendente || !nome.trim()}
        onClick={criar}
        className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-fundo transition hover:bg-accent-forte disabled:opacity-50"
      >
        Adicionar
      </button>
      {erro && <span className="text-xs text-red-400">{erro}</span>}
    </div>
  );
}

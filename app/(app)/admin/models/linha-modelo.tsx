'use client';

import { useState, useTransition } from 'react';
import type { Bloco, Model } from '@/lib/tipos';
import {
  apagarModelo,
  criarModelo,
  definirAtivaModelo,
  definirExterna,
  definirIndependente,
  definirMetaMensal,
  renomearModelo,
} from './actions';

const dinheiro = (valor: number) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });

export function LinhaModelo({ model, podeEditar }: { model: Model; podeEditar: boolean }) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(model.nome);
  const [metaMensal, setMetaMensal] = useState(model.meta_mensal);
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
            {model.independente && (
              <span className="ml-2 rounded-md bg-accent-fraco px-1.5 py-0.5 text-xs text-accent">
                independente
              </span>
            )}
            {model.externa && (
              <span className="ml-2 rounded-md border border-borda px-1.5 py-0.5 text-xs text-texto-fraco">
                externa
              </span>
            )}
          </>
        )}
      </td>
      <td className="px-3 py-2.5 text-texto-fraco">
        {editando ? (
          <input
            type="number"
            step="0.01"
            value={metaMensal}
            onChange={(e) => setMetaMensal(Number(e.target.value))}
            className="w-28 rounded-lg border border-borda bg-fundo px-2 py-1.5 text-sm outline-none focus:border-accent"
          />
        ) : (
          <>meta {dinheiro(model.meta_mensal)}/mês</>
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
                setMetaMensal(model.meta_mensal);
                setEditando(false);
              }}
              className="text-xs text-texto-fraco hover:text-texto"
            >
              cancelar
            </button>
            <button
              type="button"
              disabled={pendente}
              onClick={() =>
                rodar(async () => {
                  await renomearModelo(model.id, nome);
                  await definirMetaMensal(model.id, metaMensal);
                })
              }
              className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-fundo hover:bg-accent-forte disabled:opacity-50"
            >
              salvar
            </button>
          </div>
        ) : (
          podeEditar && (
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
                onClick={() => rodar(() => definirIndependente(model.id, !model.independente))}
                className="text-xs text-texto-fraco hover:text-texto disabled:opacity-50"
              >
                {model.independente ? 'tirar independente' : 'marcar independente'}
              </button>
              <button
                type="button"
                disabled={pendente}
                onClick={() => rodar(() => definirExterna(model.id, !model.externa))}
                className="text-xs text-texto-fraco hover:text-texto disabled:opacity-50"
              >
                {model.externa ? 'tirar externa' : 'marcar externa'}
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
          )
        )}
      </td>
    </tr>
  );
}

export function FormularioModelo({ bloco }: { bloco: Bloco }) {
  const [nome, setNome] = useState('');
  const [independente, setIndependente] = useState(false);
  const [externa, setExterna] = useState(false);
  const [pendente, executar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function criar() {
    if (!nome.trim()) return;
    executar(async () => {
      setErro(null);
      try {
        await criarModelo(nome.trim(), bloco, independente, externa);
        setNome('');
        setIndependente(false);
        setExterna(false);
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não deu para criar.');
      }
    });
  }

  return (
    <div className="space-y-1.5">
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
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-texto-fraco">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={independente}
            onChange={(e) => setIndependente(e.target.checked)}
            className="size-3.5 accent-[var(--color-accent)]"
          />
          independente (ex.: Kaylin — sem cadeia de desconto confiável)
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={externa}
            onChange={(e) => setExterna(e.target.checked)}
            className="size-3.5 accent-[var(--color-accent)]"
          />
          externa (fora dos dois times — só invoice pessoal, sem meta/bônus)
        </label>
      </div>
      {erro && <span className="text-xs text-red-400">{erro}</span>}
    </div>
  );
}

'use client';

import { useMemo, useRef, useState } from 'react';
import type { AbaPlanejamento, ItemMass } from '@/lib/planejamentoDb';
import { diaLegivel } from '@/lib/tempo';
import { apagarAba, criarAba, salvarConteudo } from './actions';
import { ListaBlocosMass, NotebookLivre } from './blocos';

type TurnoEscalado = { data: string; rotulo: string; modelos: { id: string; nome: string }[] };

type Props = {
  podeEditar: boolean;
  nomeAlvo: string;
  abasIniciais: AbaPlanejamento[];
  todosModelos: { id: string; nome: string }[];
  modelosAtivas: { id: string; nome: string }[];
  turnosEscalados: TurnoEscalado[];
};

const pill = (ativo: boolean) =>
  `rounded-lg px-3 py-1.5 text-sm transition ${
    ativo ? 'bg-accent-fraco text-accent' : 'text-texto-fraco hover:bg-superficie-alta hover:text-texto'
  }`;

export function Planejador({
  podeEditar,
  nomeAlvo,
  abasIniciais,
  todosModelos,
  modelosAtivas,
  turnosEscalados,
}: Props) {
  const [abas, setAbas] = useState(abasIniciais);
  const [dataAtiva, setDataAtiva] = useState<string | null>(abasIniciais[0]?.data ?? null);
  const [modeloAtivo, setModeloAtivo] = useState<string | null>(abasIniciais[0]?.modelos[0]?.modeloId ?? null);
  const [status, setStatus] = useState<'idle' | 'salvando' | 'salvo'>('idle');
  const [mostrarNovaAba, setMostrarNovaAba] = useState(false);
  const [novaDataManual, setNovaDataManual] = useState('');
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const nomesModelos = useMemo(() => new Map(todosModelos.map((m) => [m.id, m.nome])), [todosModelos]);
  const abasOrdenadas = useMemo(() => [...abas].sort((a, b) => b.data.localeCompare(a.data)), [abas]);
  const abaAtual = abas.find((a) => a.data === dataAtiva) ?? null;
  const modeloAtual = abaAtual?.modelos.find((m) => m.modeloId === modeloAtivo) ?? null;

  function selecionarAba(data: string) {
    setDataAtiva(data);
    const aba = abas.find((a) => a.data === data);
    setModeloAtivo(aba?.modelos[0]?.modeloId ?? null);
  }

  async function adicionarModelo(data: string, modeloId: string) {
    setAbas((atual) => {
      const existe = atual.find((a) => a.data === data);
      if (!existe) return [{ data, modelos: [{ modeloId, itens: [], textoLivre: '' }] }, ...atual];
      if (existe.modelos.some((m) => m.modeloId === modeloId)) return atual;
      return atual.map((a) =>
        a.data === data ? { ...a, modelos: [...a.modelos, { modeloId, itens: [], textoLivre: '' }] } : a,
      );
    });
    setDataAtiva(data);
    setModeloAtivo(modeloId);
    await criarAba(data, modeloId);
  }

  async function escolherTurnoEscalado(t: TurnoEscalado) {
    setMostrarNovaAba(false);
    for (const m of t.modelos) {
      // Sequencial de propósito: cada chamada lê/atualiza o mesmo array local
      // de abas, então precisa terminar antes da próxima começar.
      await adicionarModelo(t.data, m.id);
    }
  }

  function criarDataManual() {
    if (!novaDataManual) return;
    setAbas((atual) => (atual.some((a) => a.data === novaDataManual) ? atual : [{ data: novaDataManual, modelos: [] }, ...atual]));
    setDataAtiva(novaDataManual);
    setModeloAtivo(null);
    setNovaDataManual('');
    setMostrarNovaAba(false);
  }

  async function removerModelo(data: string, modeloId: string) {
    await apagarAba(data, modeloId);
    setAbas((atual) =>
      atual
        .map((a) => (a.data === data ? { ...a, modelos: a.modelos.filter((m) => m.modeloId !== modeloId) } : a))
        .filter((a) => a.modelos.length > 0),
    );
    if (dataAtiva === data && modeloAtivo === modeloId) {
      const restantes = abaAtual?.modelos.filter((m) => m.modeloId !== modeloId) ?? [];
      setModeloAtivo(restantes[0]?.modeloId ?? null);
      if (restantes.length === 0) setDataAtiva(null);
    }
  }

  function agendarSalvar(data: string, modeloId: string, itens: ItemMass[], textoLivre: string) {
    const chave = `${data}|${modeloId}`;
    const timerAtual = timers.current.get(chave);
    if (timerAtual) clearTimeout(timerAtual);
    setStatus('salvando');
    timers.current.set(
      chave,
      setTimeout(() => {
        salvarConteudo(data, modeloId, itens, textoLivre)
          .then(() => setStatus('salvo'))
          .catch(() => setStatus('idle'));
      }, 900),
    );
  }

  function atualizarAtivo(patch: { itens?: ItemMass[]; textoLivre?: string }) {
    if (!dataAtiva || !modeloAtivo || !modeloAtual) return;
    const itens = patch.itens ?? modeloAtual.itens;
    const textoLivre = patch.textoLivre ?? modeloAtual.textoLivre;
    setAbas((atual) =>
      atual.map((a) =>
        a.data !== dataAtiva
          ? a
          : {
              ...a,
              modelos: a.modelos.map((m) => (m.modeloId !== modeloAtivo ? m : { ...m, itens, textoLivre })),
            },
      ),
    );
    agendarSalvar(dataAtiva, modeloAtivo, itens, textoLivre);
  }

  function adicionarMass() {
    if (!modeloAtual) return;
    const novoItem: ItemMass = { id: crypto.randomUUID(), texto: '', nota: '' };
    atualizarAtivo({ itens: [...modeloAtual.itens, novoItem] });
  }

  function alterarItem(id: string, patch: Partial<ItemMass>) {
    if (!modeloAtual) return;
    atualizarAtivo({ itens: modeloAtual.itens.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  }

  function removerItem(id: string) {
    if (!modeloAtual) return;
    atualizarAtivo({ itens: modeloAtual.itens.filter((i) => i.id !== id) });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Planejar turno</h1>
        <p className="mt-1 text-sm text-texto-fraco">
          {podeEditar ? 'Sua caixa de areia pra preparar mass e respostas antes do turno.' : `Planejamento de ${nomeAlvo} — só leitura.`}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-borda pb-3">
        {abasOrdenadas.map((a) => (
          <button key={a.data} type="button" onClick={() => selecionarAba(a.data)} className={pill(a.data === dataAtiva)}>
            {diaLegivel(a.data)}
          </button>
        ))}
        {podeEditar && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMostrarNovaAba((v) => !v)}
              className="rounded-lg border border-dashed border-borda px-3 py-1.5 text-sm text-texto-fraco hover:border-accent hover:text-accent"
            >
              + nova data
            </button>
            {mostrarNovaAba && (
              <div className="absolute left-0 top-full z-10 mt-2 w-80 rounded-xl border border-borda bg-superficie-alta p-3 shadow-xl">
                {turnosEscalados.length > 0 && (
                  <>
                    <p className="text-xs font-medium uppercase tracking-wide text-texto-fraco">Turno já escalado</p>
                    <div className="mt-1.5 max-h-48 space-y-1 overflow-y-auto">
                      {turnosEscalados.map((t) => (
                        <button
                          key={`${t.data}-${t.rotulo}`}
                          type="button"
                          onClick={() => escolherTurnoEscalado(t)}
                          className="block w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-superficie"
                        >
                          <span className="font-medium">{diaLegivel(t.data)}</span>{' '}
                          <span className="text-texto-fraco">
                            {t.rotulo} · {t.modelos.map((m) => m.nome).join(', ') || '—'}
                          </span>
                        </button>
                      ))}
                    </div>
                    <div className="my-3 border-t border-borda" />
                  </>
                )}
                <p className="text-xs font-medium uppercase tracking-wide text-texto-fraco">Ou escolha a data</p>
                <div className="mt-1.5 flex gap-2">
                  <input
                    type="date"
                    value={novaDataManual}
                    onChange={(e) => setNovaDataManual(e.target.value)}
                    className="flex-1 rounded-lg border border-borda bg-fundo px-2 py-1.5 text-sm outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={criarDataManual}
                    disabled={!novaDataManual}
                    className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-fundo disabled:opacity-40"
                  >
                    criar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {abaAtual && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {abaAtual.modelos.map((m) => (
              <span key={m.modeloId} className="inline-flex items-center">
                <button type="button" onClick={() => setModeloAtivo(m.modeloId)} className={pill(m.modeloId === modeloAtivo)}>
                  {nomesModelos.get(m.modeloId) ?? '—'}
                </button>
                {podeEditar && (
                  <button
                    type="button"
                    onClick={() => removerModelo(abaAtual.data, m.modeloId)}
                    className="-ml-1 px-1.5 text-xs text-texto-fraco hover:text-red-400"
                    title="Remover essa modelo desta data"
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
            {podeEditar && (
              <select
                value=""
                onChange={(e) => e.target.value && adicionarModelo(abaAtual.data, e.target.value)}
                className="rounded-lg border border-dashed border-borda bg-fundo px-2 py-1.5 text-sm text-texto-fraco outline-none hover:border-accent"
              >
                <option value="">+ modelo</option>
                {modelosAtivas
                  .filter((m) => !abaAtual.modelos.some((am) => am.modeloId === m.id))
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
              </select>
            )}
          </div>

          {modeloAtual ? (
            <div className="space-y-4">
              {/* Blocos "mass" — cartão próprio, independente do caderno abaixo. */}
              <div className="rounded-2xl border border-borda bg-superficie p-5">
                <div className="flex items-center gap-3">
                  {podeEditar && (
                    <button
                      type="button"
                      onClick={adicionarMass}
                      className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-fundo hover:bg-accent-forte"
                    >
                      + Mass
                    </button>
                  )}
                  <span className="ml-auto text-xs text-texto-fraco">
                    {status === 'salvando' ? 'salvando…' : status === 'salvo' ? 'salvo' : ''}
                  </span>
                </div>

                {modeloAtual.itens.length > 0 ? (
                  <div className="mt-4">
                    <ListaBlocosMass
                      itens={modeloAtual.itens}
                      podeEditar={podeEditar}
                      onReordenar={(itens) => atualizarAtivo({ itens })}
                      onAlterarItem={alterarItem}
                      onRemoverItem={removerItem}
                    />
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-texto-fraco">Nenhum bloco mass ainda.</p>
                )}
              </div>

              {/* O bloco de notas livre — cartão separado, sem botão pra criar,
                  é sempre a "folha" do caderno. */}
              <div className="rounded-2xl border border-borda bg-superficie p-5">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-texto-fraco">Bloco de notas</p>
                <NotebookLivre
                  html={modeloAtual.textoLivre}
                  podeEditar={podeEditar}
                  onMudar={(html) => atualizarAtivo({ textoLivre: html })}
                />
              </div>
            </div>
          ) : (
            podeEditar && <p className="text-sm text-texto-fraco">Escolha ou adicione uma modelo pra essa data.</p>
          )}
        </>
      )}

      {abas.length === 0 && (
        <p className="text-sm text-texto-fraco">
          {podeEditar ? 'Nenhuma aba ainda — crie uma acima.' : 'Nada planejado ainda.'}
        </p>
      )}
    </div>
  );
}

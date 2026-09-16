'use client';

import { useState, useTransition } from 'react';
import { dataBRT } from '@/lib/tempo';
import type { Bloco, Model } from '@/lib/tipos';
import {
  ajustarInicioPeriodo,
  apagarModelo,
  criarModelo,
  definirAtivaModelo,
  definirExtra,
  definirMetaMensal,
  definirValorEntrada,
  moverTime,
  renomearModelo,
} from './actions';

const dinheiro = (valor: number) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });

export function LinhaModelo({
  model,
  podeEditar,
  inicioAtual,
}: {
  model: Model;
  podeEditar: boolean;
  inicioAtual: string | null;
}) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(model.nome);
  const [metaMensal, setMetaMensal] = useState(model.meta_mensal);
  const [desde, setDesde] = useState(inicioAtual ?? dataBRT());
  const [valorEntrada, setValorEntrada] = useState(model.valor_entrada);
  const [pendente, executar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const rodar = (acao: () => Promise<void | { erro: string | null }>) =>
    executar(async () => {
      setErro(null);
      try {
        const resultado = await acao();
        if (resultado?.erro) {
          setErro(resultado.erro);
          return;
        }
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
            {model.extra && (
              <span className="ml-2 rounded-md bg-accent-fraco px-1.5 py-0.5 text-xs text-accent">
                extra
              </span>
            )}
          </>
        )}
      </td>
      <td className="px-3 py-2.5 text-texto-fraco">
        {editando ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              step="0.01"
              value={metaMensal}
              onChange={(e) => setMetaMensal(Number(e.target.value))}
              className="w-28 rounded-lg border border-borda bg-fundo px-2 py-1.5 text-sm outline-none focus:border-accent"
            />
            <label className="flex items-center gap-1 text-xs">
              desde
              <input
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="rounded-md border border-borda bg-fundo px-2 py-1 text-xs outline-none focus:border-accent"
              />
            </label>
            <label className="flex items-center gap-1 text-xs" title="Net que ela já tinha antes de entrar pro time — só pra mostrar na barrinha, não muda comissão nenhuma.">
              entrou com
              <input
                type="number"
                step="0.01"
                min="0"
                value={valorEntrada}
                onChange={(e) => setValorEntrada(Number(e.target.value))}
                className="w-24 rounded-lg border border-borda bg-fundo px-2 py-1.5 text-sm outline-none focus:border-accent"
              />
            </label>
          </div>
        ) : (
          <>
            meta {dinheiro(model.meta_mensal)}/mês
            {model.valor_entrada > 0 && <> · entrou com {dinheiro(model.valor_entrada)}</>}
          </>
        )}
      </td>
      <td className="px-4 py-2.5 text-right">
        {erro && <span className="mr-2 text-xs text-red-400">{erro}</span>}
        {editando ? (
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setNome(model.nome);
                setMetaMensal(model.meta_mensal);
                setDesde(inicioAtual ?? dataBRT());
                setValorEntrada(model.valor_entrada);
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
                  if (desde !== inicioAtual) await ajustarInicioPeriodo(model.id, desde);
                  if (valorEntrada !== model.valor_entrada) await definirValorEntrada(model.id, valorEntrada);
                })
              }
              className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-fundo hover:bg-accent-forte disabled:opacity-50"
            >
              salvar
            </button>
          </div>
        ) : (
          podeEditar && (
            <div className="flex flex-wrap justify-end gap-3">
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
                onClick={() => rodar(() => moverTime(model.id))}
                className="text-xs text-texto-fraco hover:text-texto disabled:opacity-50"
              >
                trocar de time
              </button>
              <button
                type="button"
                disabled={pendente}
                onClick={() => rodar(() => definirExtra(model.id, !model.extra))}
                className="text-xs text-texto-fraco hover:text-texto disabled:opacity-50"
              >
                {model.extra ? 'tirar extra' : 'marcar extra'}
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
  const [extra, setExtra] = useState(false);
  const [desde, setDesde] = useState(dataBRT());
  const [metaMensal, setMetaMensal] = useState(0);
  const [valorEntrada, setValorEntrada] = useState(0);
  const [pendente, executar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function criar() {
    if (!nome.trim()) return;
    executar(async () => {
      setErro(null);
      try {
        await criarModelo(nome.trim(), bloco, extra, desde, metaMensal, valorEntrada);
        setNome('');
        setExtra(false);
        setDesde(dataBRT());
        setMetaMensal(0);
        setValorEntrada(0);
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
      <div className="flex flex-wrap items-center gap-3 text-xs text-texto-fraco">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={extra}
            onChange={(e) => setExtra(e.target.checked)}
            className="size-3.5 accent-[var(--color-accent)]"
          />
          extra (ex.: Kaylin — sem cadeia de desconto confiável, só via aba &quot;Turno Extra&quot;)
        </label>
        <label className="flex items-center gap-1.5">
          desde
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="rounded-md border border-borda bg-fundo px-2 py-1 text-xs outline-none focus:border-accent"
          />
          <span title="Se ela já trabalhou turnos antes de hoje, coloca a data de lá — assim ela aparece no roster pra corrigir/lançar esses turnos antigos em admin/turnos.">
            (?)
          </span>
        </label>
        <label className="flex items-center gap-1.5">
          meta mensal
          <input
            type="number"
            step="0.01"
            min="0"
            value={metaMensal}
            onChange={(e) => setMetaMensal(Number(e.target.value))}
            className="w-24 rounded-md border border-borda bg-fundo px-2 py-1 text-xs outline-none focus:border-accent"
          />
        </label>
        <label className="flex items-center gap-1.5" title="Net que ela já tinha antes de entrar pro time — só pra mostrar na barrinha, não muda comissão nenhuma.">
          entrou com
          <input
            type="number"
            step="0.01"
            min="0"
            value={valorEntrada}
            onChange={(e) => setValorEntrada(Number(e.target.value))}
            className="w-24 rounded-md border border-borda bg-fundo px-2 py-1 text-xs outline-none focus:border-accent"
          />
        </label>
      </div>
      {erro && <span className="text-xs text-red-400">{erro}</span>}
    </div>
  );
}

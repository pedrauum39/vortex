'use client';

import { useState, useTransition } from 'react';
import { diaLegivel } from '@/lib/tempo';
import { TURNOS, rotuloTurno, type Model, type Turno } from '@/lib/tipos';
import { apagarLeituraFiller, lancarLeituraFiller } from './actions';

const campo =
  'rounded-lg border border-borda bg-fundo px-2.5 py-2 text-sm outline-none focus:border-accent';

const LINHAS = [
  ['assinaturas', 'Assinaturas'],
  ['gorjetas', 'Gorjetas'],
  ['publicacoes', 'Publicações'],
  ['mensagens', 'Mensagens'],
  ['indicacoes', 'Indicações'],
] as const;

type Linha = (typeof LINHAS)[number][0];

export type LeituraFiller = { id: string; modeloNome: string; data: string; turno: Turno; total: number };

const dinheiro = (valor: number) => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });

/**
 * Print de uma modelo num turno que ninguém do time trabalhou (modelo nova
 * que entrou no meio do dia) — só vira base pro desconto do turno seguinte,
 * nunca venda de alguém.
 */
export function FormularioFiller({
  models,
  inicio,
  leituras,
}: {
  models: Model[];
  inicio: string;
  leituras: LeituraFiller[];
}) {
  const [modeloId, setModeloId] = useState(models[0]?.id ?? '');
  const [data, setData] = useState(inicio);
  const [turno, setTurno] = useState<Turno>('T6T1');
  const [valores, setValores] = useState<Record<Linha, string>>({
    assinaturas: '',
    gorjetas: '',
    publicacoes: '',
    mensagens: '',
    indicacoes: '',
  });
  const [pendente, executar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  function lancar() {
    if (!modeloId) return;
    executar(async () => {
      setErro(null);
      setOk(false);
      try {
        const n = (l: Linha) => Number(valores[l].replace(',', '.')) || 0;
        await lancarLeituraFiller({
          modeloId,
          data,
          turno,
          assinaturas: n('assinaturas'),
          gorjetas: n('gorjetas'),
          publicacoes: n('publicacoes'),
          mensagens: n('mensagens'),
          indicacoes: n('indicacoes'),
        });
        setOk(true);
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não deu para gravar.');
      }
    });
  }

  function apagar(id: string) {
    if (!confirm('Apagar esta leitura filler? O turno seguinte volta a ficar pendente.')) return;
    executar(async () => {
      setErro(null);
      try {
        await apagarLeituraFiller(id);
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não deu para apagar.');
      }
    });
  }

  return (
    <div className="rounded-2xl border border-borda bg-superficie p-4">
      <p className="text-sm font-medium">Leitura filler (modelo nova)</p>
      <p className="mt-1 text-xs text-texto-fraco">
        O print de uma modelo num turno que ninguém do time trabalhou — ex.: entrou no T2/T3 e você tem o print do
        T6/T1. Serve só de base pro desconto do turno seguinte; não conta venda, meta nem comissão pra ninguém.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-texto-fraco">
          Modelo
          <select value={modeloId} onChange={(e) => setModeloId(e.target.value)} className={`${campo} max-w-[12rem]`}>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-texto-fraco">
          Data do turno
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={campo} />
        </label>

        <label className="flex flex-col gap-1 text-xs text-texto-fraco">
          Turno
          <select value={turno} onChange={(e) => setTurno(e.target.value as Turno)} className={campo}>
            {TURNOS.map((t) => (
              <option key={t} value={t}>
                {rotuloTurno(t)}
              </option>
            ))}
          </select>
        </label>

        {LINHAS.map(([linha, rotulo]) => (
          <label key={linha} className="flex flex-col gap-1 text-xs text-texto-fraco">
            {rotulo}
            <input
              inputMode="decimal"
              value={valores[linha]}
              onChange={(e) => setValores((v) => ({ ...v, [linha]: e.target.value }))}
              placeholder="0,00"
              className={`${campo} w-24`}
            />
          </label>
        ))}

        <button
          type="button"
          disabled={pendente || !modeloId}
          onClick={lancar}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-fundo transition hover:bg-accent-forte disabled:opacity-50"
        >
          {pendente ? 'Gravando…' : 'Lançar filler'}
        </button>

        {ok && <span className="text-xs text-accent">gravado ✓</span>}
        {erro && <span className="text-xs text-red-400">{erro}</span>}
      </div>

      {leituras.length > 0 && (
        <ul className="mt-4 space-y-1 border-t border-borda pt-3 text-sm">
          {leituras.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-3">
              <span className="text-accent">{l.modeloNome}</span>
              <span className="text-texto-fraco">
                {diaLegivel(l.data)} · {rotuloTurno(l.turno)}
              </span>
              <span>{dinheiro(l.total)}</span>
              <button type="button" onClick={() => apagar(l.id)} className="text-xs text-red-400 hover:underline">
                apagar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

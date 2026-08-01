'use client';

import { useCallback, useEffect, useState } from 'react';
import { reduzirImagem } from '@/lib/imagem';
import {
  LINHAS,
  baseComissao,
  deltaTurno,
  linhasQueCairam,
  somaConfere,
  totalDasLinhas,
  type LinhasNet,
} from '@/lib/statement';
import type { Anterior } from '@/lib/statementDb';
import { statementAnterior } from './actions';

const ROTULO: Record<string, string> = {
  assinaturas: 'Assinaturas',
  gorjetas: 'Gorjetas',
  publicacoes: 'Publicações',
  mensagens: 'Mensagens',
  indicacoes: 'Indicações',
};

const VAZIO: LinhasNet = { assinaturas: 0, gorjetas: 0, publicacoes: 0, mensagens: 0, indicacoes: 0 };

const dinheiro = (valor: number) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });

export type ResultadoModelo = {
  linhas: LinhasNet;
  netTotal: number;
  blob: Blob | null;
  ocrRaw: unknown;
  corrigidoManualmente: boolean;
  refundConfirmado: boolean;
  lendo: boolean;
  pronto: boolean;
};

export function ReportModelo({
  shiftId,
  modeloId,
  modeloNome,
  onChange,
}: {
  shiftId: string;
  modeloId: string;
  modeloNome: string;
  onChange: (resultado: ResultadoModelo) => void;
}) {
  const [anterior, setAnterior] = useState<Anterior | null>(null);
  const [linhas, setLinhas] = useState<LinhasNet>(VAZIO);
  const [totalImpresso, setTotalImpresso] = useState(0);
  const [editou, setEditou] = useState(false);

  const [blob, setBlob] = useState<Blob | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [ocrRaw, setOcrRaw] = useState<unknown>(null);
  const [lendo, setLendo] = useState(false);
  const [avisoOcr, setAvisoOcr] = useState<string | null>(null);
  const [refundConfirmado, setRefundConfirmado] = useState(false);

  useEffect(() => {
    statementAnterior(shiftId, modeloId)
      .then(setAnterior)
      .catch(() => setAnterior({ tipo: 'pendente' }));
  }, [shiftId, modeloId]);

  const base = anterior?.tipo === 'ok' ? anterior.linhas : null;
  const podeCalcular = anterior?.tipo === 'ok' || anterior?.tipo === 'primeiro';
  const caiu = linhasQueCairam(linhas, base);
  const somaBate = somaConfere(linhas, totalImpresso);
  const doTurno = deltaTurno(linhas, base);
  const preenchido = totalDasLinhas(linhas) > 0;
  const pronto = preenchido && somaBate && (caiu.length === 0 || refundConfirmado);

  useEffect(() => {
    onChange({
      linhas,
      netTotal: totalImpresso || totalDasLinhas(linhas),
      blob,
      ocrRaw,
      corrigidoManualmente: editou,
      refundConfirmado,
      lendo,
      pronto,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, totalImpresso, blob, ocrRaw, editou, refundConfirmado, lendo, pronto]);

  const lerPrint = useCallback(async (arquivo: Blob) => {
    setLendo(true);
    setAvisoOcr(null);
    try {
      const { blob, base64 } = await reduzirImagem(arquivo);
      setBlob(blob);
      setPrevia(`data:image/jpeg;base64,${base64}`);

      const resposta = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagem: base64, tipo: 'image/jpeg' }),
      });

      if (!resposta.ok) {
        setAvisoOcr('Não deu para ler o print automaticamente. Digite os valores.');
        return;
      }

      const lido = await resposta.json();
      setOcrRaw(lido);
      setLinhas({
        assinaturas: lido.net.assinaturas,
        gorjetas: lido.net.gorjetas,
        publicacoes: lido.net.publicacoes,
        mensagens: lido.net.mensagens,
        indicacoes: lido.net.indicacoes,
      });
      setTotalImpresso(lido.net.total);
      setEditou(false);
    } catch {
      setAvisoOcr('Não deu para ler o print automaticamente. Digite os valores.');
    } finally {
      setLendo(false);
    }
  }, []);

  function limparPrint() {
    setBlob(null);
    setPrevia(null);
    setOcrRaw(null);
    setAvisoOcr(null);
    setLinhas(VAZIO);
    setTotalImpresso(0);
    setEditou(false);
  }

  return (
    <div className="rounded-xl border border-borda p-4">
      <p className="text-sm font-medium text-accent">{modeloNome}</p>

      <div
        tabIndex={0}
        onDrop={(e) => {
          e.preventDefault();
          const arquivo = e.dataTransfer.files?.[0];
          if (arquivo?.type.startsWith('image/')) lerPrint(arquivo);
        }}
        onDragOver={(e) => e.preventDefault()}
        onPaste={(e) => {
          const imagem = [...e.clipboardData.items]
            .find((item) => item.type.startsWith('image/'))
            ?.getAsFile();
          if (imagem) {
            e.preventDefault();
            lerPrint(imagem);
          }
        }}
        className="mt-2 rounded-lg border border-dashed border-borda bg-fundo p-3 text-center outline-none focus:border-accent"
      >
        {previa ? (
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previa} alt="Print do statement" className="mx-auto max-h-32 rounded border border-borda" />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                limparPrint();
              }}
              aria-label="Remover print"
              title="Remover print"
              className="absolute -right-2 -top-2 flex size-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold leading-none text-white hover:bg-red-600"
            >
              ×
            </button>
          </div>
        ) : (
          <p className="text-xs text-texto-fraco">
            Clique aqui e cole com <kbd className="rounded bg-superficie-alta px-1.5 py-0.5">Ctrl+V</kbd> ou arraste
          </p>
        )}
        <label className="mt-2 inline-block cursor-pointer text-xs text-accent hover:underline">
          {previa ? 'trocar imagem' : 'escolher arquivo'}
          <input
            type="file"
            accept="image/*"
            onChange={(e) => e.target.files?.[0] && lerPrint(e.target.files[0])}
            className="hidden"
          />
        </label>
      </div>

      {lendo && <p className="mt-2 text-xs text-accent">Lendo o print…</p>}
      {avisoOcr && <p className="mt-2 text-xs text-amber-300">{avisoOcr}</p>}

      <div className="mt-3 space-y-1.5">
        {LINHAS.map((linha) => (
          <div key={linha} className="flex items-center gap-2">
            <label className="w-28 shrink-0 text-xs text-texto-fraco" htmlFor={`${modeloId}-${linha}`}>
              {ROTULO[linha]}
            </label>
            <input
              id={`${modeloId}-${linha}`}
              type="number"
              step="0.01"
              value={linhas[linha]}
              onChange={(e) => {
                setLinhas({ ...linhas, [linha]: Number(e.target.value) });
                setEditou(true);
              }}
              className={`w-full rounded-lg border bg-fundo px-2 py-1.5 text-right text-sm outline-none focus:border-accent ${
                caiu.includes(linha) ? 'border-amber-500/60' : 'border-borda'
              }`}
            />
          </div>
        ))}
        <div className="flex items-center gap-2 border-t border-borda pt-1.5">
          <label className="w-28 shrink-0 text-xs font-medium" htmlFor={`${modeloId}-total`}>
            TOTAL
          </label>
          <input
            id={`${modeloId}-total`}
            type="number"
            step="0.01"
            value={totalImpresso}
            onChange={(e) => {
              setTotalImpresso(Number(e.target.value));
              setEditou(true);
            }}
            className="w-full rounded-lg border border-borda bg-fundo px-2 py-1.5 text-right text-sm outline-none focus:border-accent"
          />
        </div>
      </div>

      {preenchido && !somaBate && (
        <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-200">
          A soma das linhas dá {dinheiro(totalDasLinhas(linhas))} e o total está{' '}
          {dinheiro(totalImpresso)}.
        </p>
      )}

      {caiu.length > 0 && (
        <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-200">
          <p>
            Conferir se houve refund — {caiu.map((l) => ROTULO[l]).join(', ')} veio menor que no
            turno anterior.
          </p>
          <button
            type="button"
            onClick={() => setRefundConfirmado(true)}
            disabled={refundConfirmado}
            className="mt-1.5 rounded-lg border border-amber-400/50 px-2 py-1 text-xs font-medium text-amber-100 hover:bg-amber-500/20 disabled:opacity-60"
          >
            {refundConfirmado ? 'Refund confirmado ✓' : 'Houve'}
          </button>
        </div>
      )}

      {anterior?.tipo === 'pendente' && (
        <p className="mt-2 rounded-lg border border-borda bg-fundo px-2 py-1.5 text-xs text-texto-fraco">
          O turno anterior desta modelo ainda não enviou o print. O valor se ajusta sozinho
          quando ele chegar.
        </p>
      )}

      {preenchido && podeCalcular && (
        <div className="mt-2 rounded-lg border border-borda bg-fundo px-2 py-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-texto-fraco">Neste turno</span>
            <span className="font-medium">{dinheiro(totalDasLinhas(doTurno))}</span>
          </div>
          <div className="mt-0.5 flex justify-between">
            <span className="text-texto-fraco">Base de comissão</span>
            <span className="font-medium text-accent">{dinheiro(baseComissao(doTurno))}</span>
          </div>
        </div>
      )}
    </div>
  );
}

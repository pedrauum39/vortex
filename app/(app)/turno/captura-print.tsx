'use client';

import { useCallback, useEffect, useState } from 'react';
import { reduzirImagem } from '@/lib/imagem';
import { LINHAS, somaConfere, totalDasLinhas, type LinhasNet } from '@/lib/statement';

const ROTULO: Record<string, string> = {
  assinaturas: 'Assinaturas',
  gorjetas: 'Gorjetas',
  publicacoes: 'Publicações',
  mensagens: 'Mensagens',
  indicacoes: 'Indicações',
};

const VAZIO: LinhasNet = { assinaturas: 0, gorjetas: 0, publicacoes: 0, mensagens: 0, indicacoes: 0 };

export type ResultadoPrint = {
  linhas: LinhasNet;
  totalImpresso: number;
  blob: Blob | null;
  ocrRaw: unknown;
  editou: boolean;
  lendo: boolean;
  /** Preenchido = tem pelo menos algum valor não-zero, digitado ou lido por OCR. */
  preenchido: boolean;
  somaBate: boolean;
};

/**
 * Captura de um print — upload/colar/arrastar + OCR, ou digitar na mão — as 5
 * linhas net + total. Usado duas vezes dentro de `ReportModelo` quando o
 * turno é "independente" (T2T3/T4T5 de uma modelo sem cadeia confiável, ex.
 * Kaylin): uma vez pro print de agora, outra pro print anterior.
 */
export function CapturaPrint({
  idPrefix,
  onChange,
}: {
  idPrefix: string;
  onChange: (resultado: ResultadoPrint) => void;
}) {
  const [linhas, setLinhas] = useState<LinhasNet>(VAZIO);
  const [totalImpresso, setTotalImpresso] = useState(0);
  const [editou, setEditou] = useState(false);

  const [blob, setBlob] = useState<Blob | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [ocrRaw, setOcrRaw] = useState<unknown>(null);
  const [lendo, setLendo] = useState(false);
  const [avisoOcr, setAvisoOcr] = useState<string | null>(null);

  const somaBate = somaConfere(linhas, totalImpresso);
  const preenchido = totalDasLinhas(linhas) > 0;

  useEffect(() => {
    onChange({ linhas, totalImpresso, blob, ocrRaw, editou, lendo, preenchido, somaBate });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, totalImpresso, blob, ocrRaw, editou, lendo, preenchido, somaBate]);

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
    <div>
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
        className="rounded-lg border border-dashed border-borda bg-fundo p-3 text-center outline-none focus:border-accent"
      >
        {previa ? (
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previa} alt="Print" className="mx-auto max-h-32 rounded border border-borda" />
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
            <label className="w-28 shrink-0 text-xs text-texto-fraco" htmlFor={`${idPrefix}-${linha}`}>
              {ROTULO[linha]}
            </label>
            <input
              id={`${idPrefix}-${linha}`}
              type="number"
              step="0.01"
              value={linhas[linha]}
              onChange={(e) => {
                setLinhas({ ...linhas, [linha]: Number(e.target.value) });
                setEditou(true);
              }}
              className="w-full rounded-lg border border-borda bg-fundo px-2 py-1.5 text-right text-sm outline-none focus:border-accent"
            />
          </div>
        ))}
        <div className="flex items-center gap-2 border-t border-borda pt-1.5">
          <label className="w-28 shrink-0 text-xs font-medium" htmlFor={`${idPrefix}-total`}>
            TOTAL
          </label>
          <input
            id={`${idPrefix}-total`}
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
          A soma das linhas dá {totalDasLinhas(linhas).toLocaleString('pt-BR', { style: 'currency', currency: 'USD' })}{' '}
          e o total está {totalImpresso.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' })}.
        </p>
      )}
    </div>
  );
}

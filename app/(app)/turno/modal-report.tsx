'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import {
  LINHAS,
  baseComissao,
  deltaTurno,
  linhasQueCairam,
  somaConfere,
  totalDasLinhas,
  type LinhasNet,
} from '@/lib/statement';
import { criarClienteBrowser } from '@/lib/supabase/client';
import { finalizarTurno, statementAnterior, type Anterior } from './actions';

const ROTULO: Record<string, string> = {
  assinaturas: 'Assinaturas',
  gorjetas: 'Gorjetas',
  publicacoes: 'Publicações',
  mensagens: 'Mensagens',
  indicacoes: 'Indicações',
};

const VAZIO: LinhasNet = {
  assinaturas: 0,
  gorjetas: 0,
  publicacoes: 0,
  mensagens: 0,
  indicacoes: 0,
};

const dinheiro = (valor: number) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });

/** Reduz para 1568px no lado maior — o statement continua legível e custa metade. */
async function reduzir(arquivo: Blob): Promise<{ blob: Blob; base64: string }> {
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, 1568 / Math.max(bitmap.width, bitmap.height));

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob>((ok) =>
    canvas.toBlob((b) => ok(b!), 'image/jpeg', 0.9),
  );
  const base64 = await new Promise<string>((ok) => {
    const leitor = new FileReader();
    leitor.onload = () => ok((leitor.result as string).split(',')[1]);
    leitor.readAsDataURL(blob);
  });

  return { blob, base64 };
}

type Props = {
  logId: string;
  shiftId: string;
  repId: string;
  aoFechar: () => void;
};

export function ModalReport({ logId, shiftId, repId, aoFechar }: Props) {
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
  const [resumo, setResumo] = useState('');
  const [teveAssistente, setTeveAssistente] = useState(false);
  const [saiuAntes, setSaiuAntes] = useState(false);
  const [motivo, setMotivo] = useState('');

  const [gravando, gravar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    statementAnterior(shiftId)
      .then(setAnterior)
      .catch(() => setAnterior({ tipo: 'pendente' }));
  }, [shiftId]);

  // Só dá para descontar quando o statement do turno anterior existe. Com
  // 'primeiro' o desconto é zero; com 'pendente' não há desconto a fazer ainda.
  const base = anterior?.tipo === 'ok' ? anterior.linhas : null;
  const podeCalcular = anterior?.tipo === 'ok' || anterior?.tipo === 'primeiro';

  const caiu = linhasQueCairam(linhas, base);
  const somaBate = somaConfere(linhas, totalImpresso);
  const doTurno = deltaTurno(linhas, base);
  const preenchido = totalDasLinhas(linhas) > 0;
  const travado = (caiu.length > 0 && !refundConfirmado) || (saiuAntes && !motivo.trim());

  // Só usa setState, que o React garante estável — pode ter deps vazias e
  // servir de handler fixo para o listener de colar.
  const lerPrint = useCallback(async (arquivo: Blob) => {
    setLendo(true);
    setAvisoOcr(null);
    try {
      const { blob, base64 } = await reduzir(arquivo);
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

  // Ctrl+V em qualquer lugar do modal.
  useEffect(() => {
    function aoColar(evento: ClipboardEvent) {
      const imagem = [...(evento.clipboardData?.items ?? [])]
        .find((item) => item.type.startsWith('image/'))
        ?.getAsFile();
      if (imagem) {
        evento.preventDefault();
        lerPrint(imagem);
      }
    }

    window.addEventListener('paste', aoColar);
    return () => window.removeEventListener('paste', aoColar);
  }, [lerPrint]);

  function confirmar() {
    gravar(async () => {
      setErro(null);
      try {
        let imagemPath: string | null = null;

        if (blob) {
          const caminho = `${repId}/${logId}.jpg`;
          const { error } = await criarClienteBrowser()
            .storage.from('statements')
            .upload(caminho, blob, { contentType: 'image/jpeg', upsert: true });
          // Print que não sobe não pode travar o fechamento do turno.
          if (!error) imagemPath = caminho;
        }

        await finalizarTurno(logId, {
          linhas,
          netTotal: totalImpresso || totalDasLinhas(linhas),
          resumo,
          teveAssistente,
          saiuAntes,
          motivoSaida: motivo.trim() || null,
          imagemPath,
          ocrRaw,
          corrigidoManualmente: editou,
          refundConfirmado,
        });

        aoFechar();
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não deu para gravar.');
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-8">
      <div className="w-full max-w-lg rounded-2xl border border-borda bg-superficie p-6 shadow-2xl">
        <h2 className="text-lg font-medium">Finalizar turno</h2>

        {/* 1. print — colar ou escolher arquivo */}
        <p className="mt-5 text-sm text-texto-fraco">Print do statement</p>

        <div
          onDrop={(e) => {
            e.preventDefault();
            const arquivo = e.dataTransfer.files?.[0];
            if (arquivo?.type.startsWith('image/')) lerPrint(arquivo);
          }}
          onDragOver={(e) => e.preventDefault()}
          className="mt-1.5 rounded-lg border border-dashed border-borda bg-fundo p-4 text-center"
        >
          {previa ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previa}
              alt="Print do statement"
              className="mx-auto max-h-40 rounded border border-borda"
            />
          ) : (
            <p className="text-sm text-texto-fraco">
              Cole com <kbd className="rounded bg-superficie-alta px-1.5 py-0.5 text-xs">Ctrl+V</kbd>{' '}
              ou arraste a imagem aqui
            </p>
          )}

          <label className="mt-3 inline-block cursor-pointer text-sm text-accent hover:underline">
            {previa ? 'trocar imagem' : 'escolher arquivo'}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && lerPrint(e.target.files[0])}
              className="hidden"
            />
          </label>
        </div>

        {lendo && <p className="mt-2 text-sm text-accent">Lendo o print…</p>}
        {avisoOcr && <p className="mt-2 text-sm text-amber-300">{avisoOcr}</p>}

        {/* 2. valores */}
        <div className="mt-5 space-y-2">
          <p className="text-sm text-texto-fraco">Valores líquidos do print</p>
          {LINHAS.map((linha) => (
            <div key={linha} className="flex items-center gap-3">
              <label className="w-32 shrink-0 text-sm" htmlFor={linha}>
                {ROTULO[linha]}
              </label>
              <input
                id={linha}
                type="number"
                step="0.01"
                value={linhas[linha]}
                onChange={(e) => {
                  setLinhas({ ...linhas, [linha]: Number(e.target.value) });
                  setEditou(true);
                }}
                className={`w-full rounded-lg border bg-fundo px-3 py-2 text-right text-sm outline-none focus:border-accent ${
                  caiu.includes(linha) ? 'border-amber-500/60' : 'border-borda'
                }`}
              />
            </div>
          ))}

          <div className="flex items-center gap-3 border-t border-borda pt-3">
            <label className="w-32 shrink-0 text-sm font-medium" htmlFor="total">
              TOTAL
            </label>
            <input
              id="total"
              type="number"
              step="0.01"
              value={totalImpresso}
              onChange={(e) => {
                setTotalImpresso(Number(e.target.value));
                setEditou(true);
              }}
              className="w-full rounded-lg border border-borda bg-fundo px-3 py-2 text-right text-sm outline-none focus:border-accent"
            />
          </div>
        </div>

        {/* 3. checagens */}
        {preenchido && !somaBate && (
          <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            A soma das linhas dá {dinheiro(totalDasLinhas(linhas))} e o total está{' '}
            {dinheiro(totalImpresso)}. Confira os valores.
          </p>
        )}

        {caiu.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-200">
            <p>
              Conferir se houve refund — {caiu.map((l) => ROTULO[l]).join(', ')} veio menor que
              no turno anterior.
            </p>
            <button
              type="button"
              onClick={() => setRefundConfirmado(true)}
              disabled={refundConfirmado}
              className="mt-2 rounded-lg border border-amber-400/50 px-3 py-1.5 text-xs font-medium text-amber-100 transition hover:bg-amber-500/20 disabled:opacity-60"
            >
              {refundConfirmado ? 'Refund confirmado ✓' : 'Houve'}
            </button>
          </div>
        )}

        {anterior?.tipo === 'pendente' && (
          <p className="mt-3 rounded-lg border border-borda bg-fundo px-3 py-2.5 text-sm text-texto-fraco">
            O turno anterior desta modelo ainda não enviou o print. Pode finalizar normalmente —
            o valor do teu turno é calculado sozinho quando o print dele chegar.
          </p>
        )}

        {preenchido && podeCalcular && (
          <div className="mt-3 rounded-lg border border-borda bg-fundo px-3 py-2.5 text-sm">
            <div className="flex justify-between">
              <span className="text-texto-fraco">Você fez neste turno</span>
              <span className="font-medium">{dinheiro(totalDasLinhas(doTurno))}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-texto-fraco">Base de comissão</span>
              <span className="font-medium text-accent">{dinheiro(baseComissao(doTurno))}</span>
            </div>
          </div>
        )}

        {/* 4. report */}
        <label className="mt-5 block text-sm text-texto-fraco" htmlFor="resumo">
          Resumo do turno
        </label>
        <textarea
          id="resumo"
          rows={3}
          value={resumo}
          onChange={(e) => setResumo(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-borda bg-fundo px-3 py-2.5 text-sm outline-none focus:border-accent"
        />

        <label className="mt-4 flex items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={teveAssistente}
            onChange={(e) => setTeveAssistente(e.target.checked)}
            className="size-4 accent-[var(--color-accent)]"
          />
          Teve assistente
        </label>

        <label className="mt-2.5 flex items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={saiuAntes}
            onChange={(e) => setSaiuAntes(e.target.checked)}
            className="size-4 accent-[var(--color-accent)]"
          />
          Finalizei antes da hora
        </label>

        {saiuAntes && (
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo da saída antecipada"
            rows={2}
            className="mt-2.5 w-full rounded-lg border border-borda bg-fundo px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
        )}

        {erro && <p className="mt-4 text-sm text-red-400">{erro}</p>}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={aoFechar}
            className="rounded-lg border border-borda px-4 py-2.5 text-sm text-texto-fraco transition hover:text-texto"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={gravando || travado}
            onClick={confirmar}
            className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-fundo transition hover:bg-accent-forte disabled:opacity-50"
          >
            {gravando ? 'Gravando…' : 'Confirmar e finalizar'}
          </button>
        </div>
      </div>
    </div>
  );
}

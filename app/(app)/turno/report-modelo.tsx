'use client';

import { useEffect, useState } from 'react';
import { baseComissao, deltaTurno, linhasQueCairam, totalDasLinhas, type LinhasNet } from '@/lib/statement';
import type { Anterior } from '@/lib/statementDb';
import { statementAnterior } from './actions';
import { CapturaPrint, type ResultadoPrint } from './captura-print';

const dinheiro = (valor: number) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });

const ROTULO: Record<string, string> = {
  assinaturas: 'Assinaturas',
  gorjetas: 'Gorjetas',
  publicacoes: 'Publicações',
  mensagens: 'Mensagens',
  indicacoes: 'Indicações',
};

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
  const [anteriorAuto, setAnteriorAuto] = useState<Anterior | null>(null);
  const [atual, setAtual] = useState<ResultadoPrint | null>(null);
  const [refundConfirmado, setRefundConfirmado] = useState(false);

  useEffect(() => {
    statementAnterior(shiftId, modeloId)
      .then(setAnteriorAuto)
      .catch(() => setAnteriorAuto({ tipo: 'pendente' }));
  }, [shiftId, modeloId]);

  const base: LinhasNet | null = anteriorAuto?.tipo === 'ok' ? anteriorAuto.linhas : null;
  const podeCalcular = anteriorAuto?.tipo === 'ok' || anteriorAuto?.tipo === 'primeiro';

  const linhasAtuais = atual?.linhas ?? { assinaturas: 0, gorjetas: 0, publicacoes: 0, mensagens: 0, indicacoes: 0 };
  const caiu = linhasQueCairam(linhasAtuais, base);
  const doTurno = deltaTurno(linhasAtuais, base);
  const preenchido = atual?.preenchido ?? false;
  const somaBateAtual = atual?.somaBate ?? false;
  const pronto = preenchido && somaBateAtual && (caiu.length === 0 || refundConfirmado);

  useEffect(() => {
    onChange({
      linhas: linhasAtuais,
      netTotal: atual?.totalImpresso || totalDasLinhas(linhasAtuais),
      blob: atual?.blob ?? null,
      ocrRaw: atual?.ocrRaw ?? null,
      corrigidoManualmente: atual?.editou ?? false,
      refundConfirmado,
      lendo: atual?.lendo ?? false,
      pronto,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atual, refundConfirmado, pronto]);

  return (
    <div className="rounded-xl border border-borda p-4">
      <p className="text-sm font-medium text-accent">{modeloNome}</p>

      <div className="mt-3">
        <CapturaPrint idPrefix={`${modeloId}-atual`} onChange={setAtual} />
      </div>

      {caiu.length > 0 && (
        <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-200">
          <p>
            Conferir se houve refund — {caiu.map((l) => ROTULO[l]).join(', ')} veio menor que no turno anterior.
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

      {anteriorAuto?.tipo === 'pendente' && (
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

'use client';

import { useState, useTransition } from 'react';
import { criarClienteBrowser } from '@/lib/supabase/client';
import { finalizarTurno, type ReportModelo as ReportModeloDados } from './actions';
import { ReportModelo, type ResultadoModelo } from './report-modelo';

type Props = {
  logId: string;
  shiftId: string;
  repId: string;
  modelos: { id: string; nome: string }[];
  aoFechar: () => void;
};

export function ModalReport({ logId, shiftId, repId, modelos, aoFechar }: Props) {
  const [resultados, setResultados] = useState<Record<string, ResultadoModelo>>({});
  const [resumo, setResumo] = useState('');
  const [teveAssistente, setTeveAssistente] = useState(false);
  const [saiuAntes, setSaiuAntes] = useState(false);
  const [motivo, setMotivo] = useState('');

  const [gravando, gravar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const todosProntos =
    modelos.length > 0 &&
    modelos.every((m) => resultados[m.id]?.pronto && !resultados[m.id]?.lendo);
  const travado = !todosProntos || (saiuAntes && !motivo.trim());

  function confirmar() {
    gravar(async () => {
      setErro(null);
      try {
        const reports: ReportModeloDados[] = [];

        for (const modelo of modelos) {
          const r = resultados[modelo.id];
          let imagemPath: string | null = null;

          if (r.blob) {
            const caminho = `${repId}/${logId}-${modelo.id}.jpg`;
            const { error } = await criarClienteBrowser()
              .storage.from('statements')
              .upload(caminho, r.blob, { contentType: 'image/jpeg', upsert: true });
            // Print que não sobe não pode travar o fechamento do turno.
            if (!error) imagemPath = caminho;
          }

          reports.push({
            modeloId: modelo.id,
            linhas: r.linhas,
            netTotal: r.netTotal,
            imagemPath,
            ocrRaw: r.ocrRaw,
            corrigidoManualmente: r.corrigidoManualmente,
            refundConfirmado: r.refundConfirmado,
          });
        }

        await finalizarTurno(logId, {
          reports,
          resumo,
          teveAssistente,
          saiuAntes,
          motivoSaida: motivo.trim() || null,
        });

        aoFechar();
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não deu para gravar.');
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-8">
      <div className="w-full max-w-2xl rounded-2xl border border-borda bg-superficie p-6 shadow-2xl">
        <h2 className="text-lg font-medium">Finalizar turno</h2>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {modelos.map((modelo) => (
            <ReportModelo
              key={modelo.id}
              shiftId={shiftId}
              modeloId={modelo.id}
              modeloNome={modelo.nome}
              onChange={(resultado) =>
                setResultados((atual) => ({ ...atual, [modelo.id]: resultado }))
              }
            />
          ))}
        </div>

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

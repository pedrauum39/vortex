'use client';

import { useState, useTransition } from 'react';
import { totalDasLinhas } from '@/lib/statement';
import { criarClienteBrowser } from '@/lib/supabase/client';
import { TURNOS, rotuloTurno, type Model, type Turno } from '@/lib/tipos';
import { lancarTurnoExtraAction } from './actions';
import { CapturaPrint, type ResultadoPrint } from './captura-print';

const dinheiro = (valor: number) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });

const hoje = () => new Date().toISOString().slice(0, 10);

export function TurnoExtra({ repId, modelosExtras }: { repId: string; modelosExtras: Model[] }) {
  const [data, setData] = useState(hoje());
  const [turno, setTurno] = useState<Turno>('T2T3');
  const [modeloId, setModeloId] = useState<string>(modelosExtras[0]?.id ?? '');
  const [nomeLivre, setNomeLivre] = useState('');
  const [usaModeloDeFora, setUsaModeloDeFora] = useState(false);
  const [anterior, setAnterior] = useState<ResultadoPrint | null>(null);
  const [atual, setAtual] = useState<ResultadoPrint | null>(null);

  const [pendente, executar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  const precisaAnterior = turno !== 'T6T1';
  const anteriorPronto = !precisaAnterior || (anterior?.preenchido ?? false);
  const atualPronto = atual?.preenchido ?? false;
  const modeloEscolhida = usaModeloDeFora ? nomeLivre.trim().length > 0 : !!modeloId;
  const podeEnviar = modeloEscolhida && anteriorPronto && atualPronto && !pendente;

  function enviar() {
    executar(async () => {
      setErro(null);
      try {
        const id = crypto.randomUUID();
        const bucket = criarClienteBrowser().storage.from('statements');

        let imagemAtualPath: string | null = null;
        if (atual?.blob) {
          const caminho = `${repId}/extra-${id}-atual.jpg`;
          const { error } = await bucket.upload(caminho, atual.blob, { contentType: 'image/jpeg', upsert: true });
          if (!error) imagemAtualPath = caminho;
        }

        let imagemAnteriorPath: string | null = null;
        if (precisaAnterior && anterior?.blob) {
          const caminho = `${repId}/extra-${id}-anterior.jpg`;
          const { error } = await bucket.upload(caminho, anterior.blob, { contentType: 'image/jpeg', upsert: true });
          if (!error) imagemAnteriorPath = caminho;
        }

        await lancarTurnoExtraAction({
          id,
          data,
          turno,
          modeloId: usaModeloDeFora ? null : modeloId || null,
          nomeLivre: usaModeloDeFora ? nomeLivre.trim() : null,
          atual: atual!.linhas,
          anterior: precisaAnterior ? anterior!.linhas : null,
          imagemAtualPath,
          ocrAtualRaw: atual?.ocrRaw ?? null,
          imagemAnteriorPath,
          ocrAnteriorRaw: anterior?.ocrRaw ?? null,
        });

        setAnterior(null);
        setAtual(null);
        setNomeLivre('');
        setSucesso(true);
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não deu para gravar.');
      }
    });
  }

  return (
    <section className="rounded-2xl border border-borda bg-superficie p-6">
      <h2 className="text-lg font-medium">Turno Extra</h2>
      <p className="mt-1 text-sm text-texto-fraco">
        Pra modelos fora do turno normal — sem clock-in, é só reportar o que foi feito.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-xs text-texto-fraco">
          Dia
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="rounded-lg border border-borda bg-fundo px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-texto-fraco">
          Turno
          <select
            value={turno}
            onChange={(e) => setTurno(e.target.value as Turno)}
            className="rounded-lg border border-borda bg-fundo px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          >
            {TURNOS.map((t) => (
              <option key={t} value={t}>
                {rotuloTurno(t)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4">
        <p className="text-xs text-texto-fraco">Modelo</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          {!usaModeloDeFora ? (
            <select
              value={modeloId}
              onChange={(e) => setModeloId(e.target.value)}
              className="rounded-lg border border-borda bg-fundo px-2.5 py-1.5 text-sm outline-none focus:border-accent"
            >
              {modelosExtras.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={nomeLivre}
              onChange={(e) => setNomeLivre(e.target.value)}
              placeholder="Nome da modelo"
              className="rounded-lg border border-borda bg-fundo px-2.5 py-1.5 text-sm outline-none focus:border-accent"
            />
          )}
          <label className="flex items-center gap-1.5 text-xs text-texto-fraco">
            <input
              type="checkbox"
              checked={usaModeloDeFora}
              onChange={(e) => setUsaModeloDeFora(e.target.checked)}
              className="size-3.5 accent-[var(--color-accent)]"
            />
            é uma modelo de fora (não é do time)
          </label>
        </div>
      </div>

      {precisaAnterior && (
        <div className="mt-4">
          <p className="text-xs font-medium text-texto-fraco">Print de antes deste turno</p>
          <div className="mt-1">
            <CapturaPrint idPrefix="turno-extra-anterior" onChange={setAnterior} />
          </div>
        </div>
      )}

      <div className="mt-4">
        <p className="text-xs font-medium text-texto-fraco">Print de agora</p>
        <div className="mt-1">
          <CapturaPrint idPrefix="turno-extra-atual" onChange={setAtual} />
        </div>
      </div>

      {atualPronto && anteriorPronto && (
        <p className="mt-3 text-sm text-texto-fraco">
          Neste turno:{' '}
          <span className="font-medium text-texto">
            {dinheiro(totalDasLinhas(atual!.linhas) - (precisaAnterior ? totalDasLinhas(anterior!.linhas) : 0))}
          </span>
        </p>
      )}

      {erro && <p className="mt-3 text-sm text-red-400">{erro}</p>}
      {sucesso && <p className="mt-3 text-sm text-accent">Turno extra lançado.</p>}

      <button
        type="button"
        disabled={!podeEnviar}
        onClick={enviar}
        className="mt-4 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-fundo transition hover:bg-accent-forte disabled:opacity-40"
      >
        {pendente ? 'Enviando…' : 'Lançar turno extra'}
      </button>
    </section>
  );
}

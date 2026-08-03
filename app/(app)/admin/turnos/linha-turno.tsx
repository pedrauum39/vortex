'use client';

import { useCallback, useState, useTransition } from 'react';
import { reduzirImagem } from '@/lib/imagem';
import type { LinhaInvoice } from '@/lib/invoice';
import { LINHAS } from '@/lib/statement';
import { datetimeLocalBRT } from '@/lib/tempo';
import type { Bloco, Model } from '@/lib/tipos';
import { rotuloTurno } from '@/lib/tipos';
import { janelaDoTurno } from '@/lib/turno';
import {
  adicionarModeloAoPonto,
  apagarPonto,
  apagarStatement,
  apagarTurno,
  simularPonto,
  simularStatement,
} from './actions';
import type { LinhaShift } from './tipos';

const dinheiro = (valor: number) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });

const campo = 'w-full rounded-lg border border-borda bg-fundo px-2 py-1.5 text-sm outline-none focus:border-accent';

const ROTULO: Record<string, string> = {
  assinaturas: 'Assinaturas',
  gorjetas: 'Gorjetas',
  publicacoes: 'Publicações',
  mensagens: 'Mensagens',
  indicacoes: 'Indicações',
};

export function LinhaTurno({
  shift,
  linha,
  models,
  podeEditar,
}: {
  shift: LinhaShift;
  linha: LinhaInvoice | null;
  models: Model[];
  podeEditar: boolean;
}) {
  const [pendente, executar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [formPonto, setFormPonto] = useState(false);
  const [modeloDoForm, setModeloDoForm] = useState<string | null>(null);

  const log = shift.shift_logs[0];

  const rodar = (acao: () => Promise<void>) =>
    executar(async () => {
      setErro(null);
      try {
        await acao();
        setFormPonto(false);
        setModeloDoForm(null);
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não deu.');
      }
    });

  return (
    <>
      <tr className="border-b border-borda last:border-0">
        <td className="px-4 py-2.5">{shift.data}</td>
        <td className="px-3 py-2.5 text-texto-fraco">{rotuloTurno(shift.turno)}</td>
        <td className="px-3 py-2.5">{shift.bloco}</td>
        <td className="px-3 py-2.5">
          {shift.funcao === 'assist' ? (
            <span className="rounded-md bg-accent-fraco px-2 py-0.5 text-xs text-accent">Assistant</span>
          ) : (
            'Regular'
          )}
        </td>
        <td className="px-3 py-2.5">{shift.reps?.nome_curto ?? '—'}</td>
        <td className="px-3 py-2.5">
          {log ? (
            <div className="flex items-center gap-2">
              <span className="text-texto-fraco">
                {datetimeLocalBRT(new Date(log.clock_in_at)).slice(11)}
                {log.clock_out_at && ` – ${datetimeLocalBRT(new Date(log.clock_out_at)).slice(11)}`}
                {' · '}
                {log.shift_log_models.map((m) => m.models.nome).join(' + ') || 'sem modelo'}
              </span>
              {podeEditar && (
                <>
                  <button type="button" onClick={() => setFormPonto((v) => !v)} className="text-xs text-accent hover:underline">
                    editar
                  </button>
                  <button
                    type="button"
                    disabled={pendente}
                    onClick={() => rodar(() => apagarPonto(log.id))}
                    className="text-xs text-red-400 hover:underline disabled:opacity-50"
                  >
                    apagar
                  </button>
                </>
              )}
            </div>
          ) : podeEditar ? (
            <button type="button" onClick={() => setFormPonto(true)} className="text-xs text-accent hover:underline">
              simular ponto
            </button>
          ) : (
            <span className="text-texto-fraco">—</span>
          )}
        </td>
        <td className="px-3 py-2.5">
          {!log ? (
            <span className="text-texto-fraco">—</span>
          ) : (
            <div className="flex flex-col gap-1">
              {log.shift_log_models.map(({ model_id, models: m }) => {
                const st = log.statements.find((s) => s.model_id === model_id);
                return (
                  <div key={model_id} className="flex items-center gap-2">
                    <span className="text-texto-fraco">{m.nome}:</span>
                    {st ? (
                      <>
                        <span>{dinheiro(st.net_total)}</span>
                        {podeEditar && (
                          <>
                            <button
                              type="button"
                              onClick={() => setModeloDoForm(model_id)}
                              className="text-xs text-accent hover:underline"
                            >
                              editar
                            </button>
                            <button
                              type="button"
                              disabled={pendente}
                              onClick={() => rodar(() => apagarStatement(st.id))}
                              className="text-xs text-red-400 hover:underline disabled:opacity-50"
                            >
                              apagar
                            </button>
                          </>
                        )}
                      </>
                    ) : podeEditar ? (
                      <button
                        type="button"
                        onClick={() => setModeloDoForm(model_id)}
                        className="text-xs text-accent hover:underline"
                      >
                        simular statement
                      </button>
                    ) : (
                      <span className="text-texto-fraco">—</span>
                    )}
                  </div>
                );
              })}
              {podeEditar && (() => {
                const jaTem = new Set(log.shift_log_models.map((m) => m.model_id));
                const restantes = models.filter((m) => !jaTem.has(m.id));
                if (restantes.length === 0) return null;
                return (
                  <select
                    value=""
                    disabled={pendente}
                    onChange={(e) => {
                      if (e.target.value) rodar(() => adicionarModeloAoPonto(log.id, e.target.value));
                    }}
                    className="w-fit rounded-md border border-dashed border-borda bg-fundo px-1.5 py-1 text-xs text-texto-fraco outline-none focus:border-accent disabled:opacity-50"
                  >
                    <option value="">+ modelo</option>
                    {restantes.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nome}
                      </option>
                    ))}
                  </select>
                );
              })()}
            </div>
          )}
        </td>
        <td className="px-3 py-2.5 text-right">
          {linha ? (
            <span title={`horas $${linha.valorHoras} + comissão $${linha.comissao}`}>
              {dinheiro(linha.total)}
              {linha.pendente && <span className="ml-1 text-amber-300">·aberto</span>}
            </span>
          ) : (
            <span className="text-texto-fraco">—</span>
          )}
        </td>
        <td className="whitespace-nowrap px-4 py-2.5 text-right">
          {podeEditar && (
            <button
              type="button"
              disabled={pendente}
              onClick={() => {
                if (confirm('Apagar este turno? Ponto e statements dele somem junto.')) {
                  rodar(() => apagarTurno(shift.id));
                }
              }}
              className="text-xs text-red-400 hover:underline disabled:opacity-50"
            >
              apagar turno
            </button>
          )}
        </td>
      </tr>

      {erro && (
        <tr>
          <td colSpan={9} className="px-4 py-2 text-xs text-red-400">
            {erro}
          </td>
        </tr>
      )}

      {podeEditar && formPonto && (
        <tr className="border-b border-borda bg-superficie-alta/50">
          <td colSpan={9} className="px-4 py-3">
            <FormPonto
              repId={shift.rep_id!}
              shiftId={shift.id}
              bloco={shift.bloco}
              models={models}
              modelosAtuais={
                log?.shift_log_models.map((m) => m.model_id) ??
                models.filter((m) => m.bloco === shift.bloco).map((m) => m.id)
              }
              // Sem ponto ainda, começa com a janela oficial do turno já
              // preenchida — o T6T1 vira a noite (21h de um dia até 5h do
              // seguinte), e deixar em branco fazia o admin digitar a mesma
              // data nos dois campos, o que quebra a constraint de saída
              // não poder ser antes da entrada.
              entradaAtual={
                log
                  ? datetimeLocalBRT(new Date(log.clock_in_at))
                  : datetimeLocalBRT(janelaDoTurno(shift.turno, shift.data).inicio)
              }
              saidaAtual={
                log
                  ? log.clock_out_at
                    ? datetimeLocalBRT(new Date(log.clock_out_at))
                    : ''
                  : datetimeLocalBRT(janelaDoTurno(shift.turno, shift.data).fim)
              }
              pendente={pendente}
              onSalvar={(entrada, saida, modeloIds) =>
                rodar(() =>
                  simularPonto({ shiftId: shift.id, repId: shift.rep_id!, entrada, saida: saida || null, modeloIds }),
                )
              }
              onCancelar={() => setFormPonto(false)}
            />
          </td>
        </tr>
      )}

      {podeEditar && modeloDoForm && log && (
        <tr className="border-b border-borda bg-superficie-alta/50">
          <td colSpan={9} className="px-4 py-3">
            <FormStatement
              modeloNome={log.shift_log_models.find((m) => m.model_id === modeloDoForm)?.models.nome ?? ''}
              atual={log.statements.find((s) => s.model_id === modeloDoForm) ?? null}
              pendente={pendente}
              onSalvar={(vals) =>
                rodar(() => simularStatement({ shiftLogId: log.id, modeloId: modeloDoForm, ...vals }))
              }
              onCancelar={() => setModeloDoForm(null)}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function FormPonto({
  bloco,
  models,
  modelosAtuais,
  entradaAtual,
  saidaAtual,
  pendente,
  onSalvar,
  onCancelar,
}: {
  repId: string;
  shiftId: string;
  bloco: Bloco;
  models: Model[];
  modelosAtuais: string[];
  entradaAtual: string;
  saidaAtual: string;
  pendente: boolean;
  onSalvar: (entrada: string, saida: string, modeloIds: string[]) => void;
  onCancelar: () => void;
}) {
  const [entrada, setEntrada] = useState(entradaAtual);
  const [saida, setSaida] = useState(saidaAtual);
  const [modeloIds, setModeloIds] = useState<string[]>(modelosAtuais);

  function alternar(id: string) {
    setModeloIds((atual) =>
      atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id],
    );
  }

  const doTime = models.filter((m) => m.bloco === bloco);
  const outras = models.filter((m) => m.bloco !== bloco);

  const checkbox = (m: Model) => (
    <label
      key={m.id}
      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${
        modeloIds.includes(m.id) ? 'border-accent bg-accent-fraco text-accent' : 'border-borda text-texto-fraco'
      }`}
    >
      <input type="checkbox" checked={modeloIds.includes(m.id)} onChange={() => alternar(m.id)} className="size-3.5" />
      {m.nome}
    </label>
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">{doTime.map(checkbox)}</div>
      {outras.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-texto-fraco">outro time:</span>
          {outras.map(checkbox)}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-texto-fraco">
          Entrada (BRT)
          <input type="datetime-local" value={entrada} onChange={(e) => setEntrada(e.target.value)} className={campo} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-texto-fraco">
          Saída (BRT, opcional — em andamento se vazio)
          <input type="datetime-local" value={saida} onChange={(e) => setSaida(e.target.value)} className={campo} />
        </label>
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-lg border border-borda px-3 py-1.5 text-xs text-texto-fraco hover:text-texto"
        >
          cancelar
        </button>
        <button
          type="button"
          disabled={pendente || !entrada || modeloIds.length === 0}
          onClick={() => onSalvar(entrada, saida, modeloIds)}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-fundo hover:bg-accent-forte disabled:opacity-50"
        >
          gravar ponto
        </button>
      </div>
    </div>
  );
}

function FormStatement({
  modeloNome,
  atual,
  pendente,
  onSalvar,
  onCancelar,
}: {
  modeloNome: string;
  atual: LinhaShift['shift_logs'][number]['statements'][number] | null;
  pendente: boolean;
  onSalvar: (vals: {
    assinaturas: number;
    gorjetas: number;
    publicacoes: number;
    mensagens: number;
    indicacoes: number;
  }) => void;
  onCancelar: () => void;
}) {
  const [vals, setVals] = useState({
    assinaturas: atual?.net_assinaturas ?? 0,
    gorjetas: atual?.net_gorjetas ?? 0,
    publicacoes: atual?.net_publicacoes ?? 0,
    mensagens: atual?.net_mensagens ?? 0,
    indicacoes: atual?.net_indicacoes ?? 0,
  });
  const [lendo, setLendo] = useState(false);
  const [avisoOcr, setAvisoOcr] = useState<string | null>(null);

  const total = LINHAS.reduce((s, l) => s + vals[l], 0);

  const lerPrint = useCallback(async (arquivo: Blob) => {
    setLendo(true);
    setAvisoOcr(null);
    try {
      const { base64 } = await reduzirImagem(arquivo);
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
      setVals({
        assinaturas: lido.net.assinaturas,
        gorjetas: lido.net.gorjetas,
        publicacoes: lido.net.publicacoes,
        mensagens: lido.net.mensagens,
        indicacoes: lido.net.indicacoes,
      });
    } catch {
      setAvisoOcr('Não deu para ler o print automaticamente. Digite os valores.');
    } finally {
      setLendo(false);
    }
  }, []);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <span className="text-xs font-medium text-accent">{modeloNome}</span>
      <div
        onDrop={(e) => {
          e.preventDefault();
          const arquivo = e.dataTransfer.files?.[0];
          if (arquivo?.type.startsWith('image/')) lerPrint(arquivo);
        }}
        onDragOver={(e) => e.preventDefault()}
        className="flex flex-col items-start gap-1 rounded-lg border border-dashed border-borda bg-fundo px-2.5 py-1.5"
      >
        <label className="cursor-pointer text-xs text-accent hover:underline">
          {lendo ? 'lendo…' : 'subir print'}
          <input
            type="file"
            accept="image/*"
            disabled={lendo}
            onChange={(e) => e.target.files?.[0] && lerPrint(e.target.files[0])}
            className="hidden"
          />
        </label>
        {avisoOcr && <span className="text-xs text-amber-300">{avisoOcr}</span>}
      </div>
      {LINHAS.map((l) => (
        <label key={l} className="flex flex-col gap-1 text-xs text-texto-fraco">
          {ROTULO[l]}
          <input
            type="number"
            step="0.01"
            value={vals[l]}
            onChange={(e) => setVals({ ...vals, [l]: Number(e.target.value) })}
            className={`${campo} w-24`}
          />
        </label>
      ))}
      <span className="pb-1.5 text-xs text-texto-fraco">total {dinheiro(total)}</span>
      <button
        type="button"
        onClick={onCancelar}
        className="rounded-lg border border-borda px-3 py-1.5 text-xs text-texto-fraco hover:text-texto"
      >
        cancelar
      </button>
      <button
        type="button"
        disabled={pendente}
        onClick={() => onSalvar(vals)}
        className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-fundo hover:bg-accent-forte disabled:opacity-50"
      >
        gravar statement
      </button>
    </div>
  );
}

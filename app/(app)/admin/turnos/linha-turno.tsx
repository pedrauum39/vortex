'use client';

import { useState, useTransition } from 'react';
import type { LinhaInvoice } from '@/lib/invoice';
import { LINHAS } from '@/lib/statement';
import { datetimeLocalBRT } from '@/lib/tempo';
import { rotuloTurno } from '@/lib/tipos';
import { apagarPonto, apagarStatement, apagarTurno, simularPonto, simularStatement } from './actions';
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

export function LinhaTurno({ shift, linha }: { shift: LinhaShift; linha: LinhaInvoice | null }) {
  const [pendente, executar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [formPonto, setFormPonto] = useState(false);
  const [formStatement, setFormStatement] = useState(false);

  const log = shift.shift_logs[0];
  const statement = log?.statements;

  const rodar = (acao: () => Promise<void>) =>
    executar(async () => {
      setErro(null);
      try {
        await acao();
        setFormPonto(false);
        setFormStatement(false);
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
        <td className="px-3 py-2.5 text-texto-fraco">{shift.models?.nome ?? '—'}</td>
        <td className="px-3 py-2.5">
          {log ? (
            <div className="flex items-center gap-2">
              <span className="text-texto-fraco">
                {datetimeLocalBRT(new Date(log.clock_in_at)).slice(11)}
                {log.clock_out_at && ` – ${datetimeLocalBRT(new Date(log.clock_out_at)).slice(11)}`}
              </span>
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
            </div>
          ) : (
            <button type="button" onClick={() => setFormPonto(true)} className="text-xs text-accent hover:underline">
              simular ponto
            </button>
          )}
        </td>
        <td className="px-3 py-2.5">
          {!log ? (
            <span className="text-texto-fraco">—</span>
          ) : statement ? (
            <div className="flex items-center gap-2">
              <span className="text-texto-fraco">{dinheiro(statement.net_total)}</span>
              <button type="button" onClick={() => setFormStatement((v) => !v)} className="text-xs text-accent hover:underline">
                editar
              </button>
              <button
                type="button"
                disabled={pendente}
                onClick={() => rodar(() => apagarStatement(statement.id))}
                className="text-xs text-red-400 hover:underline disabled:opacity-50"
              >
                apagar
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setFormStatement(true)} className="text-xs text-accent hover:underline">
              simular statement
            </button>
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
        <td className="px-4 py-2.5 text-right">
          <button
            type="button"
            disabled={pendente}
            onClick={() => {
              if (confirm('Apagar este turno? Ponto e statement dele somem junto.')) {
                rodar(() => apagarTurno(shift.id));
              }
            }}
            className="text-xs text-red-400 hover:underline disabled:opacity-50"
          >
            apagar turno
          </button>
        </td>
      </tr>

      {erro && (
        <tr>
          <td colSpan={10} className="px-4 py-2 text-xs text-red-400">
            {erro}
          </td>
        </tr>
      )}

      {formPonto && (
        <tr className="border-b border-borda bg-superficie-alta/50">
          <td colSpan={10} className="px-4 py-3">
            <FormPonto
              repId={shift.rep_id!}
              shiftId={shift.id}
              entradaAtual={log ? datetimeLocalBRT(new Date(log.clock_in_at)) : ''}
              saidaAtual={log?.clock_out_at ? datetimeLocalBRT(new Date(log.clock_out_at)) : ''}
              pendente={pendente}
              onSalvar={(entrada, saida) =>
                rodar(() =>
                  simularPonto({ shiftId: shift.id, repId: shift.rep_id!, entrada, saida: saida || null }),
                )
              }
              onCancelar={() => setFormPonto(false)}
            />
          </td>
        </tr>
      )}

      {formStatement && log && (
        <tr className="border-b border-borda bg-superficie-alta/50">
          <td colSpan={10} className="px-4 py-3">
            <FormStatement
              atual={statement}
              pendente={pendente}
              onSalvar={(vals) => rodar(() => simularStatement({ shiftLogId: log.id, ...vals }))}
              onCancelar={() => setFormStatement(false)}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function FormPonto({
  entradaAtual,
  saidaAtual,
  pendente,
  onSalvar,
  onCancelar,
}: {
  repId: string;
  shiftId: string;
  entradaAtual: string;
  saidaAtual: string;
  pendente: boolean;
  onSalvar: (entrada: string, saida: string) => void;
  onCancelar: () => void;
}) {
  const [entrada, setEntrada] = useState(entradaAtual);
  const [saida, setSaida] = useState(saidaAtual);

  return (
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
        disabled={pendente || !entrada}
        onClick={() => onSalvar(entrada, saida)}
        className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-fundo hover:bg-accent-forte disabled:opacity-50"
      >
        gravar ponto
      </button>
    </div>
  );
}

function FormStatement({
  atual,
  pendente,
  onSalvar,
  onCancelar,
}: {
  atual: LinhaShift['shift_logs'][number]['statements'];
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

  const total = LINHAS.reduce((s, l) => s + vals[l], 0);

  return (
    <div className="flex flex-wrap items-end gap-3">
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

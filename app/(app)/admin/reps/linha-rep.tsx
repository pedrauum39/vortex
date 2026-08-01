'use client';

import { useState, useTransition } from 'react';
import { ROTULO_CARGO, TURNOS, rotuloTurno, type Cargo, type Rep, type Turno } from '@/lib/tipos';
import { atualizarRep } from './actions';

const CARGOS: Cargo[] = ['grand_primaris', 'knight_primaris', 'secundus', 'tertius'];

const campo = 'w-full rounded-lg border border-borda bg-fundo px-2 py-1.5 text-sm outline-none focus:border-accent';

export function LinhaRep({ rep }: { rep: Rep }) {
  const [editando, setEditando] = useState(false);
  const [dados, setDados] = useState(rep);
  const [pendente, executar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function salvar() {
    executar(async () => {
      setErro(null);
      try {
        // papel não aparece na tela — decide o rodízio da escala por baixo dos
        // panos, já conferido célula a célula contra a planilha. Reenviamos o
        // valor que já estava, sem tocar nele.
        await atualizarRep(rep.id, {
          nome_curto: dados.nome_curto,
          nome_oficial: dados.nome_oficial,
          turno: dados.turno,
          papel: rep.papel,
          cargo: dados.cargo,
          valor_hora: dados.valor_hora,
          ativo: dados.ativo,
        });
        setEditando(false);
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não deu para salvar.');
      }
    });
  }

  if (!editando) {
    return (
      <tr className="border-b border-borda last:border-0">
        <td className="px-4 py-2.5">{rep.nome_curto}</td>
        <td className="px-3 py-2.5 text-texto-fraco">{rep.nome_oficial}</td>
        <td className="px-3 py-2.5">{rotuloTurno(rep.turno)}</td>
        <td className="px-3 py-2.5">{ROTULO_CARGO[rep.cargo]}</td>
        <td className="px-3 py-2.5">${rep.valor_hora}</td>
        <td className="px-3 py-2.5">{rep.ativo ? 'sim' : 'não'}</td>
        <td className="px-4 py-2.5 text-right">
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="text-xs text-accent hover:underline"
          >
            editar
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-borda bg-superficie-alta/50 last:border-0">
      <td className="px-4 py-2.5">
        <input
          value={dados.nome_curto}
          onChange={(e) => setDados({ ...dados, nome_curto: e.target.value })}
          className={campo}
        />
      </td>
      <td className="px-3 py-2.5">
        <input
          value={dados.nome_oficial}
          onChange={(e) => setDados({ ...dados, nome_oficial: e.target.value })}
          className={campo}
        />
      </td>
      <td className="px-3 py-2.5">
        <select
          value={dados.turno}
          onChange={(e) => setDados({ ...dados, turno: e.target.value as Turno })}
          className={campo}
        >
          {TURNOS.map((t) => (
            <option key={t} value={t}>
              {rotuloTurno(t)}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2.5">
        <select
          value={dados.cargo}
          onChange={(e) => setDados({ ...dados, cargo: e.target.value as Cargo })}
          className={campo}
        >
          {CARGOS.map((c) => (
            <option key={c} value={c}>
              {ROTULO_CARGO[c]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2.5">
        <input
          type="number"
          step="0.01"
          value={dados.valor_hora}
          onChange={(e) => setDados({ ...dados, valor_hora: Number(e.target.value) })}
          className={`${campo} w-20`}
        />
      </td>
      <td className="px-3 py-2.5">
        <input
          type="checkbox"
          checked={dados.ativo}
          onChange={(e) => setDados({ ...dados, ativo: e.target.checked })}
          className="size-4 accent-[var(--color-accent)]"
        />
      </td>
      <td className="px-4 py-2.5 text-right">
        <div className="flex items-center justify-end gap-2">
          {erro && <span className="text-xs text-red-400">{erro}</span>}
          <button
            type="button"
            onClick={() => {
              setDados(rep);
              setEditando(false);
            }}
            className="text-xs text-texto-fraco hover:text-texto"
          >
            cancelar
          </button>
          <button
            type="button"
            disabled={pendente}
            onClick={salvar}
            className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-fundo hover:bg-accent-forte disabled:opacity-50"
          >
            {pendente ? 'salvando…' : 'salvar'}
          </button>
        </div>
      </td>
    </tr>
  );
}

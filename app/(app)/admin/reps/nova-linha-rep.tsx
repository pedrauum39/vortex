'use client';

import { useState, useTransition } from 'react';
import { ROTULO_CARGO, TURNOS, rotuloTurno, type Cargo, type Turno } from '@/lib/tipos';
import { criarRep } from './actions';

const CARGOS: Cargo[] = ['grand_primaris', 'knight_primaris', 'secundus', 'tertius'];

const campo = 'w-full rounded-lg border border-borda bg-fundo px-2 py-1.5 text-sm outline-none focus:border-accent';

const VAZIO = {
  nome_curto: '',
  nome_oficial: '',
  turno: 'T2T3' as Turno,
  cargo: 'tertius' as Cargo,
  valor_hora: 0,
  ativo: false,
  observador: true,
};

export function NovaLinhaRep() {
  const [aberto, setAberto] = useState(false);
  const [dados, setDados] = useState(VAZIO);
  const [pendente, executar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function criar() {
    executar(async () => {
      setErro(null);
      try {
        await criarRep(dados);
        setDados(VAZIO);
        setAberto(false);
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não deu para criar.');
      }
    });
  }

  if (!aberto) {
    return (
      <tr>
        <td colSpan={9} className="px-4 py-2.5">
          <button
            type="button"
            onClick={() => setAberto(true)}
            className="text-xs text-accent hover:underline"
          >
            + adicionar membro
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="bg-superficie-alta/50">
      <td className="px-4 py-2.5">
        <input
          value={dados.nome_curto}
          onChange={(e) => setDados({ ...dados, nome_curto: e.target.value })}
          placeholder="nome curto"
          className={campo}
        />
      </td>
      <td className="px-3 py-2.5">
        <input
          value={dados.nome_oficial}
          onChange={(e) => setDados({ ...dados, nome_oficial: e.target.value })}
          placeholder="nome oficial"
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
      <td className="px-3 py-2.5">
        <input
          type="checkbox"
          checked={dados.observador}
          onChange={(e) => setDados({ ...dados, observador: e.target.checked })}
          className="size-4 accent-[var(--color-accent)]"
        />
      </td>
      <td className="px-3 py-2.5 text-xs text-texto-fraco">vincula depois de criar</td>
      <td className="px-4 py-2.5 text-right">
        <div className="flex items-center justify-end gap-2">
          {erro && <span className="text-xs text-red-400">{erro}</span>}
          <button
            type="button"
            onClick={() => {
              setDados(VAZIO);
              setAberto(false);
              setErro(null);
            }}
            className="text-xs text-texto-fraco hover:text-texto"
          >
            cancelar
          </button>
          <button
            type="button"
            disabled={pendente}
            onClick={criar}
            className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-fundo hover:bg-accent-forte disabled:opacity-50"
          >
            {pendente ? 'criando…' : 'criar'}
          </button>
        </div>
      </td>
    </tr>
  );
}

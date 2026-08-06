'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { ROTULO_CARGO, TURNOS, rotuloTurno, type Cargo, type Rep, type Turno } from '@/lib/tipos';
import { atualizarRep, desvincularLogin, vincularLogin } from './actions';

const CARGOS: Cargo[] = ['grand_primaris', 'knight_primaris', 'secundus', 'tertius'];

const campo = 'w-full rounded-lg border border-borda bg-fundo px-2 py-1.5 text-sm outline-none focus:border-accent';

export function LinhaRep({ rep, podeEditar }: { rep: Rep; podeEditar: boolean }) {
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
          observador: dados.observador,
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
        <td className="px-4 py-2.5">
          <Link href={`/admin/reps/${rep.id}`} className="text-accent hover:underline">
            {rep.nome_curto}
          </Link>
        </td>
        <td className="px-3 py-2.5 text-texto-fraco">{rep.nome_oficial}</td>
        <td className="px-3 py-2.5">{rotuloTurno(rep.turno)}</td>
        <td className="px-3 py-2.5">{ROTULO_CARGO[rep.cargo]}</td>
        <td className="px-3 py-2.5">${rep.valor_hora}</td>
        <td className="px-3 py-2.5">{rep.ativo ? 'sim' : 'não'}</td>
        <td className="px-3 py-2.5">{rep.observador ? 'sim' : 'não'}</td>
        <td className="px-3 py-2.5">
          <CelulaLogin rep={rep} podeEditar={podeEditar} />
        </td>
        <td className="px-4 py-2.5 text-right">
          {podeEditar && (
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="text-xs text-accent hover:underline"
            >
              editar
            </button>
          )}
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
      <td className="px-3 py-2.5">
        <input
          type="checkbox"
          checked={dados.observador}
          onChange={(e) => setDados({ ...dados, observador: e.target.checked })}
          className="size-4 accent-[var(--color-accent)]"
        />
      </td>
      <td className="px-3 py-2.5">
        <CelulaLogin rep={rep} podeEditar={podeEditar} />
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

/**
 * 'Pedro Ribeiro' → 'pedro.ribeiro@vortex.local'. Não precisa ser um e-mail
 * real — com "Auto Confirm User" no Supabase, ninguém confere a caixa de
 * entrada. Só serve pra dar um login sem depender do e-mail de cada rep.
 */
function sugestaoEmail(nomeCurto: string): string {
  const slug = nomeCurto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
  return `${slug}@vortex.local`;
}

/**
 * Liga o rep a uma conta do Supabase Auth já criada por fora (Dashboard).
 * Não cria conta nem senha aqui — só procura pelo e-mail e grava o id.
 */
function CelulaLogin({ rep, podeEditar }: { rep: Rep; podeEditar: boolean }) {
  const [email, setEmail] = useState(() => sugestaoEmail(rep.nome_curto));
  const [pendente, executar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  if (rep.auth_user_id) {
    return (
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-accent-fraco px-2 py-0.5 text-xs text-accent">vinculado</span>
        {podeEditar && (
          <button
            type="button"
            disabled={pendente}
            onClick={() => {
              if (confirm(`Desvincular o login de ${rep.nome_curto}? Ele não vai conseguir mais entrar.`)) {
                executar(async () => {
                  setErro(null);
                  try {
                    await desvincularLogin(rep.id);
                  } catch (e) {
                    setErro(e instanceof Error ? e.message : 'Não deu.');
                  }
                });
              }
            }}
            className="text-xs text-red-400 hover:underline disabled:opacity-50"
          >
            desvincular
          </button>
        )}
        {erro && <span className="text-xs text-red-400">{erro}</span>}
      </div>
    );
  }

  if (!podeEditar) {
    return <span className="text-xs text-texto-fraco">não vinculado</span>;
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="e-mail já criado"
        className="w-36 rounded-lg border border-borda bg-fundo px-2 py-1 text-xs outline-none focus:border-accent"
      />
      <button
        type="button"
        disabled={pendente || !email.trim()}
        onClick={() =>
          executar(async () => {
            setErro(null);
            try {
              await vincularLogin(rep.id, email);
              setEmail('');
            } catch (e) {
              setErro(e instanceof Error ? e.message : 'Não deu.');
            }
          })
        }
        className="shrink-0 rounded-md bg-accent px-2 py-1 text-xs font-medium text-fundo hover:bg-accent-forte disabled:opacity-50"
      >
        vincular
      </button>
      {erro && <span className="text-xs text-red-400">{erro}</span>}
    </div>
  );
}

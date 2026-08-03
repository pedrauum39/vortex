'use client';

import { useRouter } from 'next/navigation';
import { Fragment, useState } from 'react';
import { diaLegivel } from '@/lib/tempo';
import { TURNOS, rotuloTurno, type Bloco, type Funcao, type Rep, type Turno } from '@/lib/tipos';
import { salvarGrade } from './actions';

type Valores = Record<string, string | null>;

const chaveDe = (data: string, turno: Turno, bloco: Bloco, funcao: Funcao) =>
  `${data}|${turno}|${bloco}|${funcao}`;

/**
 * A escala em grade, como a planilha: cada célula é um select com todo mundo
 * do time (inclusive os reps de "Cover" pra quando ninguém do time pode
 * fazer o turno). Trocar o valor só atualiza a tela — fica marcado como
 * pendente até o admin clicar "Salvar alterações", que manda todas as
 * células mudadas de uma vez.
 */
export function GradeEscala({
  dias,
  reps,
  valores: valoresIniciais,
  podeEditar,
}: {
  dias: string[];
  reps: Rep[];
  valores: Valores;
  podeEditar: boolean;
}) {
  const [valores, setValores] = useState(valoresIniciais);
  const [pendentes, setPendentes] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const router = useRouter();

  function alterar(data: string, turno: Turno, bloco: Bloco, funcao: Funcao, repId: string) {
    const chave = chaveDe(data, turno, bloco, funcao);
    const valor = repId || null;
    setValores((v) => ({ ...v, [chave]: valor }));
    setPendentes((p) => new Set(p).add(chave));
    setErro(null);
  }

  async function salvar() {
    if (pendentes.size === 0) return;
    setSalvando(true);
    setErro(null);
    try {
      await salvarGrade(
        [...pendentes].map((chave) => {
          const [data, turno, bloco, funcao] = chave.split('|') as [string, Turno, Bloco, Funcao];
          return { data, turno, bloco, funcao, repId: valores[chave] ?? null };
        }),
      );
      setPendentes(new Set());
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não deu para salvar.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="rounded-2xl border border-borda bg-superficie">
      {podeEditar && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borda px-4 py-3">
          <p className="text-sm text-texto-fraco">
            {pendentes.size > 0
              ? `${pendentes.size} alteração(ões) pendente(s)`
              : 'Sem alterações pendentes'}
          </p>
          <div className="flex items-center gap-3">
            {erro && <span className="text-xs text-red-400">{erro}</span>}
            <button
              type="button"
              disabled={pendentes.size === 0 || salvando}
              onClick={salvar}
              className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-fundo transition hover:bg-accent-forte disabled:opacity-40"
            >
              {salvando ? 'Salvando…' : 'Salvar alterações'}
            </button>
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[68rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-borda">
              <th className="w-36 px-4 py-3 text-left font-medium text-texto-fraco">Turno</th>
              {dias.map((dia) => (
                <th key={dia} className="px-2 py-3 text-left font-medium text-texto-fraco">
                  {diaLegivel(dia)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(['I', 'II'] as Bloco[]).map((bloco) => (
              <BlocoDaGrade
                key={bloco}
                bloco={bloco}
                dias={dias}
                reps={reps}
                valores={valores}
                pendentes={pendentes}
                salvando={salvando}
                onChange={alterar}
                podeEditar={podeEditar}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BlocoDaGrade({
  bloco,
  dias,
  reps,
  valores,
  pendentes,
  salvando,
  onChange,
  podeEditar,
}: {
  bloco: Bloco;
  dias: string[];
  reps: Rep[];
  valores: Valores;
  pendentes: Set<string>;
  salvando: boolean;
  onChange: (data: string, turno: Turno, bloco: Bloco, funcao: Funcao, repId: string) => void;
  podeEditar: boolean;
}) {
  return (
    <>
      <tr className="border-b border-borda bg-superficie-alta">
        <td colSpan={1 + dias.length} className="px-4 py-2 text-xs font-medium tracking-wide text-accent">
          {bloco === 'I' ? 'TIME 1 · Vortex I' : 'TIME 2 · Vortex II'}
        </td>
      </tr>
      {TURNOS.map((turno) => (
        <Fragment key={turno}>
          <LinhaDaGrade
            rotulo={rotuloTurno(turno)}
            turno={turno}
            bloco={bloco}
            funcao="regular"
            dias={dias}
            reps={reps}
            valores={valores}
            pendentes={pendentes}
            salvando={salvando}
            onChange={onChange}
            podeEditar={podeEditar}
          />
          <LinhaDaGrade
            rotulo="  Assistant"
            turno={turno}
            bloco={bloco}
            funcao="assist"
            dias={dias}
            reps={reps}
            valores={valores}
            pendentes={pendentes}
            salvando={salvando}
            onChange={onChange}
            podeEditar={podeEditar}
            fraco
          />
        </Fragment>
      ))}
    </>
  );
}

function LinhaDaGrade({
  rotulo,
  turno,
  bloco,
  funcao,
  dias,
  reps,
  valores,
  pendentes,
  salvando,
  onChange,
  podeEditar,
  fraco,
}: {
  rotulo: string;
  turno: Turno;
  bloco: Bloco;
  funcao: Funcao;
  dias: string[];
  reps: Rep[];
  valores: Valores;
  pendentes: Set<string>;
  salvando: boolean;
  onChange: (data: string, turno: Turno, bloco: Bloco, funcao: Funcao, repId: string) => void;
  podeEditar: boolean;
  fraco?: boolean;
}) {
  return (
    <tr className={`border-b border-borda last:border-0 ${fraco ? 'bg-fundo/40' : ''}`}>
      <td className={`px-4 py-2 ${fraco ? 'text-xs text-texto-fraco' : 'text-texto-fraco'}`}>{rotulo}</td>
      {dias.map((dia) => {
        const chave = chaveDe(dia, turno, bloco, funcao);
        const valor = valores[chave] ?? '';
        const pendente = pendentes.has(chave);

        if (!podeEditar) {
          const nome = reps.find((r) => r.id === valor)?.nome_curto;
          return (
            <td key={dia} className="px-2.5 py-2.5 text-xs text-texto-fraco">
              {nome ?? '—'}
            </td>
          );
        }

        return (
          <td key={dia} className="px-1.5 py-1.5">
            <select
              value={valor}
              onChange={(e) => onChange(dia, turno, bloco, funcao, e.target.value)}
              disabled={salvando}
              className={`w-full rounded-lg border bg-fundo px-1.5 py-1.5 text-xs outline-none focus:border-accent disabled:opacity-50 ${
                pendente
                  ? 'border-amber-400/70'
                  : valor
                    ? 'border-borda'
                    : 'border-dashed border-borda text-texto-fraco'
              }`}
            >
              <option value="">—</option>
              {reps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome_curto}
                </option>
              ))}
            </select>
          </td>
        );
      })}
    </tr>
  );
}

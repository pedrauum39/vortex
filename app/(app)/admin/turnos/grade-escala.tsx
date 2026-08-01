'use client';

import { useRouter } from 'next/navigation';
import { Fragment, useState } from 'react';
import { diaLegivel } from '@/lib/tempo';
import { TURNOS, rotuloTurno, type Bloco, type Funcao, type Rep, type Turno } from '@/lib/tipos';
import { definirSlot } from './actions';

type Valores = Record<string, string | null>;

const chaveDe = (data: string, turno: Turno, bloco: Bloco, funcao: Funcao) =>
  `${data}|${turno}|${bloco}|${funcao}`;

/**
 * A escala em grade, como a planilha: cada célula é um select com todo mundo
 * do time. Trocar o valor grava na hora — direto no banco, sem confirmar.
 */
export function GradeEscala({
  dias,
  reps,
  valores: valoresIniciais,
}: {
  dias: string[];
  reps: Rep[];
  valores: Valores;
}) {
  const [valores, setValores] = useState(valoresIniciais);
  const [salvando, setSalvando] = useState<Set<string>>(new Set());
  const router = useRouter();

  function alterar(data: string, turno: Turno, bloco: Bloco, funcao: Funcao, repId: string) {
    const chave = chaveDe(data, turno, bloco, funcao);
    setValores((v) => ({ ...v, [chave]: repId || null }));
    setSalvando((s) => new Set(s).add(chave));

    definirSlot({ data, turno, bloco, funcao, repId: repId || null })
      .catch((e) => {
        alert(e instanceof Error ? e.message : 'Não deu para salvar.');
        setValores((v) => ({ ...v, [chave]: valoresIniciais[chave] ?? null }));
      })
      .finally(() => {
        setSalvando((s) => {
          const novo = new Set(s);
          novo.delete(chave);
          return novo;
        });
        router.refresh();
      });
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-borda bg-superficie">
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
              salvando={salvando}
              onChange={alterar}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BlocoDaGrade({
  bloco,
  dias,
  reps,
  valores,
  salvando,
  onChange,
}: {
  bloco: Bloco;
  dias: string[];
  reps: Rep[];
  valores: Valores;
  salvando: Set<string>;
  onChange: (data: string, turno: Turno, bloco: Bloco, funcao: Funcao, repId: string) => void;
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
            salvando={salvando}
            onChange={onChange}
          />
          <LinhaDaGrade
            rotulo="  Assistant"
            turno={turno}
            bloco={bloco}
            funcao="assist"
            dias={dias}
            reps={reps}
            valores={valores}
            salvando={salvando}
            onChange={onChange}
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
  salvando,
  onChange,
  fraco,
}: {
  rotulo: string;
  turno: Turno;
  bloco: Bloco;
  funcao: Funcao;
  dias: string[];
  reps: Rep[];
  valores: Valores;
  salvando: Set<string>;
  onChange: (data: string, turno: Turno, bloco: Bloco, funcao: Funcao, repId: string) => void;
  fraco?: boolean;
}) {
  return (
    <tr className={`border-b border-borda last:border-0 ${fraco ? 'bg-fundo/40' : ''}`}>
      <td className={`px-4 py-2 ${fraco ? 'text-xs text-texto-fraco' : 'text-texto-fraco'}`}>{rotulo}</td>
      {dias.map((dia) => {
        const chave = chaveDe(dia, turno, bloco, funcao);
        const valor = valores[chave] ?? '';
        return (
          <td key={dia} className="px-1.5 py-1.5">
            <select
              value={valor}
              onChange={(e) => onChange(dia, turno, bloco, funcao, e.target.value)}
              disabled={salvando.has(chave)}
              className={`w-full rounded-lg border bg-fundo px-1.5 py-1.5 text-xs outline-none focus:border-accent disabled:opacity-50 ${
                valor ? 'border-borda' : 'border-dashed border-borda text-texto-fraco'
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

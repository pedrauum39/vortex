'use client';

import { useRouter } from 'next/navigation';
import { Fragment, useState } from 'react';
import { diaLegivel } from '@/lib/tempo';
import { INICIO_TIME3 } from '@/lib/escala';
import { BLOCOS, TURNOS, rotuloTurno, type Bloco, type Funcao, type Metade, type Rep, type Turno } from '@/lib/tipos';
import { dividirTurno, juntarTurno, salvarGrade } from './actions';

type Valores = Record<string, string | null>;

const chaveDe = (data: string, turno: Turno, bloco: Bloco, funcao: Funcao, metade: Metade = 0) =>
  `${data}|${turno}|${bloco}|${funcao}|${metade}`;

type OnChange = (data: string, turno: Turno, bloco: Bloco, funcao: Funcao, metade: Metade, repId: string) => void;
type OnDividir = (data: string, turno: Turno, bloco: Bloco, dividido: boolean) => void;

/** Slot dividido em metades: tem alguma linha de metade 1 ou 2 gravada. */
const estaDividido = (valores: Valores, data: string, turno: Turno, bloco: Bloco) =>
  (['regular', 'assist'] as Funcao[]).some((f) =>
    ([1, 2] as Metade[]).some((m) => chaveDe(data, turno, bloco, f, m) in valores),
  );

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

  function alterar(data: string, turno: Turno, bloco: Bloco, funcao: Funcao, metade: Metade, repId: string) {
    const chave = chaveDe(data, turno, bloco, funcao, metade);
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
          const [data, turno, bloco, funcao, metade] = chave.split('|') as [string, Turno, Bloco, Funcao, string];
          return { data, turno, bloco, funcao, metade: Number(metade) as Metade, repId: valores[chave] ?? null };
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

  // Dividir/juntar grava na hora (preserva o ponto de quem já bateu) e
  // recarrega a grade — por isso só com nada pendente, senão a recarga
  // descartaria as trocas ainda não salvas.
  async function alternarDivisao(data: string, turno: Turno, bloco: Bloco, dividido: boolean) {
    if (pendentes.size > 0) {
      setErro('Salve as alterações antes de dividir ou juntar um turno.');
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      if (dividido) await juntarTurno(data, turno, bloco);
      else await dividirTurno(data, turno, bloco);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não deu para dividir o turno.');
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
            {(dias[dias.length - 1] >= INICIO_TIME3 ? BLOCOS : (['I', 'II'] as Bloco[])).map((bloco) => (
              <BlocoDaGrade
                key={bloco}
                bloco={bloco}
                dias={dias}
                reps={reps}
                valores={valores}
                pendentes={pendentes}
                salvando={salvando}
                onChange={alterar}
                onDividir={alternarDivisao}
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
  onDividir,
  podeEditar,
}: {
  bloco: Bloco;
  dias: string[];
  reps: Rep[];
  valores: Valores;
  pendentes: Set<string>;
  salvando: boolean;
  onChange: OnChange;
  onDividir: OnDividir;
  podeEditar: boolean;
}) {
  return (
    <>
      <tr className="border-b border-borda bg-superficie-alta">
        <td colSpan={1 + dias.length} className="px-4 py-2 text-xs font-medium tracking-wide text-accent">
          TIME {BLOCOS.indexOf(bloco) + 1} · Vortex {bloco}
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
            onDividir={onDividir}
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
  onDividir,
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
  onChange: OnChange;
  /** Só na linha do regular: o botão de dividir/juntar o turno do dia. */
  onDividir?: OnDividir;
  podeEditar: boolean;
  fraco?: boolean;
}) {
  return (
    <tr className={`border-b border-borda last:border-0 ${fraco ? 'bg-fundo/40' : ''}`}>
      <td className={`px-4 py-2 ${fraco ? 'text-xs text-texto-fraco' : 'text-texto-fraco'}`}>{rotulo}</td>
      {dias.map((dia) => {
        const dividido = estaDividido(valores, dia, turno, bloco);
        const metades: Metade[] = dividido ? [1, 2] : [0];
        const nomeDe = (m: Metade) =>
          reps.find((r) => r.id === valores[chaveDe(dia, turno, bloco, funcao, m)])?.nome_curto ?? '—';

        if (!podeEditar) {
          return (
            <td key={dia} className="px-2.5 py-2.5 text-xs text-texto-fraco">
              {metades.map(nomeDe).join(' / ')}
            </td>
          );
        }

        return (
          <td key={dia} className="px-1.5 py-1.5">
            <div className="flex items-start gap-1">
              <div className="min-w-0 flex-1 space-y-1">
                {metades.map((m) => {
                  const chave = chaveDe(dia, turno, bloco, funcao, m);
                  const valor = valores[chave] ?? '';
                  const pendente = pendentes.has(chave);
                  return (
                    <div key={m} className="flex items-center gap-1">
                      {m > 0 && (
                        <span className="w-5 shrink-0 text-[10px] text-texto-fraco">{rotuloTurno(turno, m)}</span>
                      )}
                      <select
                        value={valor}
                        onChange={(e) => onChange(dia, turno, bloco, funcao, m, e.target.value)}
                        disabled={salvando}
                        className={`w-full min-w-0 rounded-lg border bg-fundo px-1.5 py-1.5 text-xs outline-none focus:border-accent disabled:opacity-50 ${
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
                    </div>
                  );
                })}
              </div>
              {onDividir && (
                <button
                  type="button"
                  disabled={salvando}
                  onClick={() => onDividir(dia, turno, bloco, dividido)}
                  title={
                    dividido
                      ? `Juntar ${rotuloTurno(turno, 1)} e ${rotuloTurno(turno, 2)} de volta num turno só`
                      : `Dividir em ${rotuloTurno(turno, 1)} e ${rotuloTurno(turno, 2)} (alguém saiu no meio)`
                  }
                  className={`mt-1 shrink-0 rounded px-1 text-xs transition disabled:opacity-40 ${
                    dividido ? 'text-accent hover:text-texto' : 'text-texto-fraco/60 hover:text-accent'
                  }`}
                >
                  {dividido ? '⇥' : '✂'}
                </button>
              )}
            </div>
          </td>
        );
      })}
    </tr>
  );
}

// Formatação e agrupamento do log de trocas da escala (/admin/turnos).
// Puro — sem I/O. A página resolve rep_id → nome/cargo e os modelos do
// bloco antes de chamar aqui.

import { dataBRT } from './tempo';
import { ROTULO_CARGO, rotuloTurno, TURNOS, type Bloco, type Cargo, type Funcao, type Turno } from './tipos';

export type EntradaLog = {
  id: string;
  criadoEm: string; // ISO — instante em que a troca foi salva
  data: string; // 'YYYY-MM-DD' do turno afetado
  turno: Turno;
  bloco: Bloco;
  funcao: Funcao;
  repSaiu: string | null;
  cargoSaiu: Cargo | null;
  repEntrou: string | null;
  cargoEntrou: Cargo | null;
  alteradoPor: string | null; // nome curto de quem fez a mudança; null se desconhecido
  modelosDoBloco: string[];
};

/** Uma linha "Sai:" ou "Entra:" já pronta pra exibir. */
export type LadoLog = { rotulo: 'Sai' | 'Entra'; nome: string; qualificador: string | null };

/** As trocas de um time (bloco) dentro de um turno+dia — regular e assistant
 *  juntos. `titulo` são as modelos daquele bloco na data. */
export type TimeLog = { titulo: string; lados: LadoLog[] };

/** Um turno num dia específico, com um bloco por time que teve troca. */
export type TurnoDiaLog = { turno: Turno; data: string; times: TimeLog[] };

/** Tudo que uma pessoa mudou num mesmo dia. */
export type GrupoLog = { diaMudanca: string; alteradoPor: string | null; turnos: TurnoDiaLog[] };

const tituloDoTime = (e: EntradaLog): string =>
  e.modelosDoBloco.length > 0 ? e.modelosDoBloco.join(' + ') : e.bloco === 'I' ? 'Time 1' : 'Time 2';

/** Assistant mostra "(Assistant)" no lugar do cargo; regular mostra o cargo. */
const qualificador = (e: EntradaLog, cargo: Cargo | null): string | null =>
  e.funcao === 'assist' ? 'Assistant' : cargo ? ROTULO_CARGO[cargo] : null;

/** Junta as entradas por chave, mantendo a ordem de primeira aparição. */
function agrupar<T>(entradas: EntradaLog[], chave: (e: EntradaLog) => string, cria: (e: EntradaLog) => T) {
  const mapa = new Map<string, { valor: T; itens: EntradaLog[] }>();
  for (const e of entradas) {
    const k = chave(e);
    const grupo = mapa.get(k) ?? { valor: cria(e), itens: [] };
    grupo.itens.push(e);
    mapa.set(k, grupo);
  }
  return [...mapa.values()];
}

const ladosDaEntrada = (e: EntradaLog): LadoLog[] => {
  const lados: LadoLog[] = [];
  if (e.repSaiu) lados.push({ rotulo: 'Sai', nome: e.repSaiu, qualificador: qualificador(e, e.cargoSaiu) });
  if (e.repEntrou) lados.push({ rotulo: 'Entra', nome: e.repEntrou, qualificador: qualificador(e, e.cargoEntrou) });
  return lados;
};

/**
 * Estrutura o log em: pessoa + dia-da-mudança → turno + dia-do-turno → time →
 * linhas Sai/Entra. Os grupos de pessoa vêm do mais recente pro mais antigo;
 * dentro deles os turnos ficam em ordem crescente de dia (depois de turno). O
 * resto mantém a ordem recebida (a página entrega por criado_em desc).
 */
export function agruparLog(entradas: EntradaLog[]): GrupoLog[] {
  return agrupar(
    entradas,
    (e) => `${dataBRT(new Date(e.criadoEm))}\0${e.alteradoPor ?? ''}`,
    (e) => ({ diaMudanca: dataBRT(new Date(e.criadoEm)), alteradoPor: e.alteradoPor }),
  )
    .map(({ valor, itens }) => {
      const turnos = agrupar(itens, (e) => `${e.turno}\0${e.data}`, (e) => ({ turno: e.turno, data: e.data }))
        .map(({ valor: td, itens: doTurno }) => ({
          ...td,
          times: agrupar(doTurno, (e) => e.bloco, tituloDoTime).map(({ valor: titulo, itens: doTime }) => ({
            titulo,
            lados: doTime.flatMap(ladosDaEntrada),
          })),
        }))
        .sort((a, b) => a.data.localeCompare(b.data) || TURNOS.indexOf(a.turno) - TURNOS.indexOf(b.turno));

      return { ...valor, turnos } satisfies GrupoLog;
    })
    .sort((a, b) => b.diaMudanca.localeCompare(a.diaMudanca));
}

/** 'YYYY-MM-DD' → 'DD/MM'. */
export function diaMes(data: string): string {
  const [, mes, dia] = data.split('-');
  return `${dia}/${mes}`;
}

/** 'Mudanças por Pedro · 07/09' — ou 'Mudanças feitas 07/09' se não se sabe quem. */
export function cabecalhoDoGrupo(grupo: GrupoLog): string {
  return grupo.alteradoPor
    ? `Mudanças por ${grupo.alteradoPor} · ${diaMes(grupo.diaMudanca)}`
    : `Mudanças feitas ${diaMes(grupo.diaMudanca)}`;
}

const linhaLado = (l: LadoLog): string =>
  l.qualificador ? `${l.rotulo}: ${l.nome} (${l.qualificador})` : `${l.rotulo}: ${l.nome}`;

/**
 * Versão texto pro botão "Copiar" — pensada pra colar no Telegram, que
 * entende `**negrito**`. Destaca pessoa + dia, turno + dia e o nome do time.
 */
export function textoDoLog(grupos: GrupoLog[]): string {
  return grupos
    .map((grupo) => {
      const partes = [`**${cabecalhoDoGrupo(grupo)}**`];
      for (const td of grupo.turnos) {
        const bloco = [`➤ **${rotuloTurno(td.turno)} · ${diaMes(td.data)}**`];
        for (const time of td.times) {
          bloco.push('', `**${time.titulo}**`, ...time.lados.map(linhaLado));
        }
        partes.push(bloco.join('\n'));
      }
      return partes.join('\n\n');
    })
    .join('\n\n');
}

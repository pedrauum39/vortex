// Formatação e agrupamento do log de trocas da escala (/admin/turnos).
// Puro — sem I/O. A página resolve rep_id → nome/cargo e os modelos do
// bloco antes de chamar aqui.

import { dataBRT } from './tempo';
import { ROTULO_CARGO, rotuloTurno, type Bloco, type Cargo, type Funcao, type Turno } from './tipos';

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

export type GrupoLog = { diaMudanca: string; alteradoPor: string | null; itens: EntradaLog[] };

/**
 * Agrupa pelo par (dia BRT da mudança, quem fez). Grupos do mais recente pro
 * mais antigo pelo dia; o sort é estável, então vários autores no mesmo dia
 * mantêm a ordem de primeira aparição (a página entrega já ordenado por
 * criado_em desc).
 */
export function agruparPorDiaDaMudanca(entradas: EntradaLog[]): GrupoLog[] {
  const grupos = new Map<string, GrupoLog>();
  for (const entrada of entradas) {
    const dia = dataBRT(new Date(entrada.criadoEm));
    const chave = `${dia}\0${entrada.alteradoPor ?? ''}`;
    const grupo = grupos.get(chave) ?? { diaMudanca: dia, alteradoPor: entrada.alteradoPor, itens: [] };
    grupo.itens.push(entrada);
    grupos.set(chave, grupo);
  }
  return [...grupos.values()].sort((a, b) => b.diaMudanca.localeCompare(a.diaMudanca));
}

/** 'YYYY-MM-DD' → 'DD/MM'. */
export function diaMes(data: string): string {
  const [, mes, dia] = data.split('-');
  return `${dia}/${mes}`;
}

/** Cabeçalho de um item: 'T2/T3 · 10/09 · Joyce + Riley'. */
function tituloDoItem(item: EntradaLog): string {
  const turno = rotuloTurno(item.turno) + (item.funcao === 'assist' ? ' (Assistant)' : '');
  const partes = [turno, diaMes(item.data)];
  if (item.modelosDoBloco.length > 0) partes.push(item.modelosDoBloco.join(' + '));
  return partes.join(' · ');
}

function linhaLado(rotulo: string, nome: string | null, cargo: Cargo | null): string | null {
  if (!nome) return null;
  return cargo ? `${rotulo}: ${nome} (${ROTULO_CARGO[cargo]})` : `${rotulo}: ${nome}`;
}

/** 'Mudanças por Pedro · 07/09' — ou 'Mudanças feitas 07/09' se não se sabe quem. */
export function cabecalhoDoGrupo(grupo: GrupoLog): string {
  return grupo.alteradoPor
    ? `Mudanças por ${grupo.alteradoPor} · ${diaMes(grupo.diaMudanca)}`
    : `Mudanças feitas ${diaMes(grupo.diaMudanca)}`;
}

/** Versão texto puro do bloco inteiro, pro botão "Copiar". */
export function textoDoLog(grupos: GrupoLog[]): string {
  return grupos
    .map((grupo) => {
      const linhas = [cabecalhoDoGrupo(grupo), ''];
      for (const item of grupo.itens) {
        linhas.push(tituloDoItem(item));
        const sai = linhaLado('Sai', item.repSaiu, item.cargoSaiu);
        const entra = linhaLado('Entra', item.repEntrou, item.cargoEntrou);
        if (sai) linhas.push(sai);
        if (entra) linhas.push(entra);
      }
      return linhas.join('\n');
    })
    .join('\n\n');
}

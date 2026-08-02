// Soma horas + comissão de um período, slot a slot. Função pura — quem chama
// já resolveu os dados do banco em SlotResolvido; aqui só tem aritmética.
//
// Um turno "double" tem o rep trabalhando 1 ou 2 modelos ao mesmo tempo, cada
// uma com o próprio statement e a própria cadeia de desconto. A base de
// comissão do turno é a SOMA dos deltas de cada modelo — o resto (percentual
// do cargo, fatia do assistente) não muda, porque `pagamentoDoSlot` só recebe
// um número.

import { pagamentoDoSlot, type RegraComissao } from './comissao';
import { baseComissao, deltaTurno, type LinhasNet } from './statement';
import type { Bloco, Cargo, Turno } from './tipos';
import { horasDoTurno } from './turno';

/** O que uma pessoa trabalhou numa modelo específica do slot. */
export type ModeloTrabalhada = {
  modeloId: string;
  /** Statement acumulado deste turno para esta modelo. Null se ainda não chegou. */
  statement: LinhasNet | null;
  /** Statement acumulado da mesma modelo no turno anterior da cadeia. */
  anterior: LinhasNet | null;
  /** true quando existe turno anterior mas ele ainda não tem statement desta modelo. */
  anteriorPendente: boolean;
};

type PessoaNoSlot = {
  repId: string;
  cargo: Cargo;
  valorHora: number;
  clockIn: Date;
  clockOut: Date | null;
  /** Turno fechado sem isto marcado sempre paga a janela inteira (8h). */
  saiuAntes: boolean;
  /** 1 modelo no caso normal, 2 num double. */
  modelos: ModeloTrabalhada[];
};

export type SlotResolvido = {
  data: string;
  turno: Turno;
  bloco: Bloco;
  regular: PessoaNoSlot | null;
  // O assistente não reporta modelo própria — leva uma fatia da comissão do
  // regular, então não precisa da cadeia de statements.
  assist: Omit<PessoaNoSlot, 'modelos'> | null;
};

export type LinhaInvoice = {
  data: string;
  turno: Turno;
  bloco: Bloco;
  repId: string;
  funcao: 'regular' | 'assist';
  horas: number;
  valorHoras: number;
  base: number;
  comissao: number;
  total: number;
  /** Falta o statement de alguma modelo do turno, ou do anterior na cadeia. */
  pendente: boolean;
  /** Turno em andamento — sem clock out ainda. */
  parcial: boolean;
};

const centavos = (valor: number) => Math.round(valor * 100) / 100;

/** Soma os deltas de cada modelo trabalhada. Modelo sem statement contribui 0
 * e marca a linha como pendente, sem travar o que já está resolvido. */
function baseDoRegular(modelos: ModeloTrabalhada[]): { base: number; pendente: boolean } {
  if (modelos.length === 0) return { base: 0, pendente: true };

  let base = 0;
  let pendente = false;

  for (const m of modelos) {
    if (!m.statement || m.anteriorPendente) {
      pendente = true;
      continue;
    }
    base += baseComissao(deltaTurno(m.statement, m.anterior));
  }

  return { base: centavos(base), pendente };
}

export function linhasDoSlot(
  slot: SlotResolvido,
  regra: RegraComissao,
  agora: Date = new Date(),
): LinhaInvoice[] {
  if (!slot.regular) return [];

  const regular = slot.regular;
  const parcialRegular = !regular.clockOut;
  const horasRegular = horasDoTurno(
    slot.turno,
    slot.data,
    regular.clockIn,
    regular.clockOut,
    regular.saiuAntes,
    agora,
  );

  const { base, pendente } = baseDoRegular(regular.modelos);

  const horasAssist = slot.assist
    ? horasDoTurno(
        slot.turno,
        slot.data,
        slot.assist.clockIn,
        slot.assist.clockOut,
        slot.assist.saiuAntes,
        agora,
      )
    : 0;

  const { regular: pagRegular, assistente: pagAssist } = pagamentoDoSlot(
    { horas: horasRegular, base, cargo: regular.cargo, valorHora: regular.valorHora },
    slot.assist ? { horas: horasAssist, valorHora: slot.assist.valorHora } : null,
    regra,
  );

  const linhas: LinhaInvoice[] = [
    {
      data: slot.data,
      turno: slot.turno,
      bloco: slot.bloco,
      repId: regular.repId,
      funcao: 'regular',
      horas: horasRegular,
      valorHoras: pagRegular.horas,
      base,
      comissao: pagRegular.comissao,
      total: pagRegular.total,
      pendente,
      parcial: parcialRegular,
    },
  ];

  if (slot.assist && pagAssist) {
    linhas.push({
      data: slot.data,
      turno: slot.turno,
      bloco: slot.bloco,
      repId: slot.assist.repId,
      funcao: 'assist',
      horas: horasAssist,
      valorHoras: pagAssist.horas,
      base: 0,
      comissao: pagAssist.comissao,
      total: pagAssist.total,
      pendente,
      parcial: !slot.assist.clockOut,
    });
  }

  return linhas;
}

export type TotaisPeriodo = {
  turnos: number;
  horas: number;
  valorHoras: number;
  comissao: number;
  total: number;
  parciais: number;
  pendentes: number;
};

export function totaisDoPeriodo(linhas: LinhaInvoice[]): TotaisPeriodo {
  const totais: TotaisPeriodo = {
    turnos: linhas.length,
    horas: 0,
    valorHoras: 0,
    comissao: 0,
    total: 0,
    parciais: 0,
    pendentes: 0,
  };

  for (const l of linhas) {
    totais.horas = centavos(totais.horas + l.horas);
    totais.valorHoras = centavos(totais.valorHoras + l.valorHoras);
    totais.comissao = centavos(totais.comissao + l.comissao);
    totais.total = centavos(totais.total + l.total);
    if (l.parcial) totais.parciais++;
    if (l.pendente) totais.pendentes++;
  }

  return totais;
}

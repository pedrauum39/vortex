// Soma horas + comissão de um período, slot a slot. Função pura — quem chama
// já resolveu os dados do banco em SlotResolvido; aqui só tem aritmética.

import { pagamentoDoSlot, type RegraComissao } from './comissao';
import { baseComissao, deltaTurno, type LinhasNet } from './statement';
import type { Bloco, Cargo, Turno } from './tipos';
import { horasDoTurno } from './turno';

type PessoaNoSlot = {
  repId: string;
  cargo: Cargo;
  valorHora: number;
  clockIn: Date;
  clockOut: Date | null;
  /** Statement acumulado deste turno. Null se ainda não chegou. */
  statement: LinhasNet | null;
  /** Statement acumulado do turno anterior na cadeia do dia. */
  anterior: LinhasNet | null;
  /** true quando existe turno anterior mas ele ainda não tem statement. */
  anteriorPendente: boolean;
};

export type SlotResolvido = {
  data: string;
  turno: Turno;
  bloco: Bloco;
  regular: PessoaNoSlot | null;
  assist: Omit<PessoaNoSlot, 'statement' | 'anterior' | 'anteriorPendente'> | null;
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
  /** Sem statement do próprio turno, ou do anterior na cadeia. */
  pendente: boolean;
  /** Turno em andamento — sem clock out ainda. */
  parcial: boolean;
};

const centavos = (valor: number) => Math.round(valor * 100) / 100;

export function linhasDoSlot(
  slot: SlotResolvido,
  regra: RegraComissao,
  agora: Date = new Date(),
): LinhaInvoice[] {
  if (!slot.regular) return [];

  const regular = slot.regular;
  const parcialRegular = !regular.clockOut;
  const horasRegular = horasDoTurno(slot.turno, slot.data, regular.clockIn, regular.clockOut, agora);

  const pendente = !regular.statement || regular.anteriorPendente;
  const base = pendente
    ? 0
    : baseComissao(deltaTurno(regular.statement!, regular.anterior));

  const horasAssist = slot.assist
    ? horasDoTurno(slot.turno, slot.data, slot.assist.clockIn, slot.assist.clockOut, agora)
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

// Vendas da empresa inteira num período — base compartilhada pra aba
// /primaris (resumo de todo mundo) e pro bônus de Party/Team addition no
// invoice dos primaris. Só turnos regulares contam: o assistente não tem
// venda própria, leva uma fatia da comissão do regular.

import type { SupabaseClient } from '@supabase/supabase-js';
import { percentualAtingido } from './meta';
import { baseComissao, deltaTurno, diaDoStatement, totalDasLinhas, type LinhasNet } from './statement';
import { buscarAnterior } from './statementDb';
import { somarDias } from './tempo';
import type { Bloco, Cargo, Turno } from './tipos';

const arred = (valor: number) => Math.round(valor * 100) / 100;

/** T6T1 cruza a meia-noite e conta pro dia seguinte no statement (diaDoStatement)
 * — um T6T1 datado 31/07 pertence a agosto, não julho. */
function dentroDoPeriodo(turno: Turno, data: string, inicio: string, fim: string): boolean {
  const dia = diaDoStatement(turno, data);
  return dia >= inicio && dia <= fim;
}

export type VendaDeModelo = {
  repId: string;
  repCargo: Cargo;
  modeloId: string;
  modeloBloco: Bloco;
  /** As 5 categorias — o que de fato foi vendido no turno. */
  vendidoTotal: number;
  /** Só as comissionáveis (gorjetas+publicações+mensagens) — base do % de comissão. */
  vendidoComissionavel: number;
};

type LinhaShift = {
  data: string;
  turno: Turno;
  rep_id: string | null;
  reps: { cargo: Cargo } | null;
  shift_logs: {
    shift_log_models: { model_id: string; models: { nome: string; bloco: Bloco } }[];
    statements: {
      model_id: string;
      net_assinaturas: number;
      net_gorjetas: number;
      net_publicacoes: number;
      net_mensagens: number;
      net_indicacoes: number;
    }[];
  }[];
};

/** Todo mundo que trabalhou uma modelo, turno a turno, no período — o delta de cada um. */
export async function buscarVendasDaEmpresa(
  db: SupabaseClient,
  inicio: string,
  fim: string,
): Promise<VendaDeModelo[]> {
  // Busca desde um dia antes: um T6T1 do fim do mês anterior pode pertencer a
  // este período (diaDoStatement), mas sua `data` fica fora da janela crua.
  const inicioBusca = somarDias(inicio, -1);

  const { data: shiftsData } = await db
    .from('shifts')
    .select(
      'data, turno, rep_id, reps(cargo), shift_logs(shift_log_models(model_id, models(nome, bloco)), statements(model_id, net_assinaturas, net_gorjetas, net_publicacoes, net_mensagens, net_indicacoes))',
    )
    .eq('funcao', 'regular')
    .gte('data', inicioBusca)
    .lte('data', fim)
    .order('data');

  const shifts = ((shiftsData ?? []) as unknown as LinhaShift[]).filter((s) =>
    dentroDoPeriodo(s.turno, s.data, inicio, fim),
  );
  const vendas: VendaDeModelo[] = [];

  for (const shift of shifts) {
    const log = shift.shift_logs[0];
    if (!log || !shift.rep_id || !shift.reps) continue;

    for (const { model_id, models: modelo } of log.shift_log_models) {
      const statement = log.statements.find((s) => s.model_id === model_id) ?? null;
      if (!statement) continue;

      const anterior = await buscarAnterior(db, shift.turno, shift.data, model_id);
      if (anterior.tipo === 'pendente') continue;

      const linhasAtuais: LinhasNet = {
        assinaturas: Number(statement.net_assinaturas),
        gorjetas: Number(statement.net_gorjetas),
        publicacoes: Number(statement.net_publicacoes),
        mensagens: Number(statement.net_mensagens),
        indicacoes: Number(statement.net_indicacoes),
      };
      const anteriorLinhas = anterior.tipo === 'ok' ? anterior.linhas : null;
      const delta = deltaTurno(linhasAtuais, anteriorLinhas);

      vendas.push({
        repId: shift.rep_id,
        repCargo: shift.reps.cargo,
        modeloId: model_id,
        modeloBloco: modelo.bloco,
        vendidoTotal: totalDasLinhas(delta),
        vendidoComissionavel: baseComissao(delta),
      });
    }
  }

  return vendas;
}

export type ResumoPagina = {
  modeloId: string;
  nome: string;
  bloco: Bloco;
  vendido: number;
  meta: number;
  percentual: number | null;
};

export type ResumoPrimaris = {
  porRep: { repId: string; nomeCurto: string; cargo: Cargo; vendido: number }[];
  porPagina: ResumoPagina[];
  porTime: Record<Bloco, { vendido: number; meta: number; percentual: number | null }>;
  total: { vendido: number; meta: number; percentual: number | null };
};

/** Resumo pra aba /primaris: quem vendeu quanto, cada página, cada time e o Vortex inteiro. */
export async function buscarResumoPrimaris(
  db: SupabaseClient,
  inicio: string,
  fim: string,
): Promise<ResumoPrimaris> {
  const [vendas, { data: repsData }, { data: modelsData }] = await Promise.all([
    buscarVendasDaEmpresa(db, inicio, fim),
    db.from('reps').select('id, nome_curto, cargo').eq('ativo', true).order('nome_curto'),
    db.from('models').select('id, nome, bloco, meta_mensal').eq('ativa', true).order('bloco').order('nome'),
  ]);

  const reps = (repsData ?? []) as { id: string; nome_curto: string; cargo: Cargo }[];
  const models = (modelsData ?? []) as { id: string; nome: string; bloco: Bloco; meta_mensal: number }[];

  const vendidoPorRep = new Map<string, number>();
  const vendidoPorModelo = new Map<string, number>();
  for (const v of vendas) {
    vendidoPorRep.set(v.repId, (vendidoPorRep.get(v.repId) ?? 0) + v.vendidoTotal);
    vendidoPorModelo.set(v.modeloId, (vendidoPorModelo.get(v.modeloId) ?? 0) + v.vendidoTotal);
  }

  const porRep = reps
    .map((r) => ({
      repId: r.id,
      nomeCurto: r.nome_curto,
      cargo: r.cargo,
      vendido: arred(vendidoPorRep.get(r.id) ?? 0),
    }))
    .sort((a, b) => b.vendido - a.vendido);

  const porPagina: ResumoPagina[] = models.map((m) => {
    const vendido = arred(vendidoPorModelo.get(m.id) ?? 0);
    return {
      modeloId: m.id,
      nome: m.nome,
      bloco: m.bloco,
      vendido,
      meta: m.meta_mensal,
      percentual: percentualAtingido(vendido, m.meta_mensal),
    };
  });

  const porTime = {} as ResumoPrimaris['porTime'];
  for (const bloco of ['I', 'II'] as Bloco[]) {
    const paginasDoTime = porPagina.filter((p) => p.bloco === bloco);
    const vendido = arred(paginasDoTime.reduce((s, p) => s + p.vendido, 0));
    const meta = arred(paginasDoTime.reduce((s, p) => s + p.meta, 0));
    porTime[bloco] = { vendido, meta, percentual: percentualAtingido(vendido, meta) };
  }

  const vendidoTotal = arred(porTime.I.vendido + porTime.II.vendido);
  const metaTotal = arred(porTime.I.meta + porTime.II.meta);

  return {
    porRep,
    porPagina,
    porTime,
    total: { vendido: vendidoTotal, meta: metaTotal, percentual: percentualAtingido(vendidoTotal, metaTotal) },
  };
}

export type CargoPrimaris = 'grand_primaris' | 'knight_primaris';

/** GP é sempre dono do Time 1 (Vortex I), KP do Time 2 (Vortex II) — fixo, não
 * depende de em qual turno o próprio GP/KP trabalha. O que decide é o bloco
 * da PÁGINA (modelo) trabalhada, não do rep que a trabalhou. */
const TIME_DO_PRIMARIS: Record<CargoPrimaris, Bloco> = {
  grand_primaris: 'I',
  knight_primaris: 'II',
};

const PERCENTUAL_TEAM_ADDITION = 0.005;
const PERCENTUAL_PARTY_SECUNDUS = 0.015;
const PERCENTUAL_PARTY_TERTIUS = 0.02;

export type BonusPrimaris = {
  /** Só o Grand Primaris tem — 0,5% do comissionável de TODAS as páginas, os dois times. */
  teamAddition: number;
  /** 1,5% do que cada secundus vendeu + 2% do que cada tertius vendeu, só nas páginas do time do primaris. */
  partyAddition: number;
};

/**
 * Dinheiro NOVO — não desconta de ninguém, soma em cima do que o
 * secundus/tertius já recebe normalmente pelo próprio turno.
 */
export async function buscarBonusPrimaris(
  db: SupabaseClient,
  cargo: CargoPrimaris,
  inicio: string,
  fim: string,
): Promise<BonusPrimaris> {
  const vendas = await buscarVendasDaEmpresa(db, inicio, fim);
  const timeDoPrimaris = TIME_DO_PRIMARIS[cargo];

  let teamAddition = 0;
  let partyAddition = 0;

  for (const v of vendas) {
    if (cargo === 'grand_primaris') {
      teamAddition += v.vendidoComissionavel * PERCENTUAL_TEAM_ADDITION;
    }

    if (v.modeloBloco !== timeDoPrimaris) continue;
    if (v.repCargo === 'secundus') partyAddition += v.vendidoComissionavel * PERCENTUAL_PARTY_SECUNDUS;
    else if (v.repCargo === 'tertius') partyAddition += v.vendidoComissionavel * PERCENTUAL_PARTY_TERTIUS;
  }

  return { teamAddition: arred(teamAddition), partyAddition: arred(partyAddition) };
}

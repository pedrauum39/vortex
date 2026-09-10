// Vendas da empresa inteira num período — base compartilhada pra aba
// /primaris (resumo de todo mundo) e pro bônus de Party/Team addition no
// invoice dos primaris. Só turnos regulares contam: o assistente não tem
// venda própria, leva uma fatia da comissão do regular.

import type { SupabaseClient } from '@supabase/supabase-js';
import { metaDiariaDaPagina, percentualAtingido } from './meta';
import { blocoNaData, metaProrateada, type Periodo } from './periodos';
import { buscarPeriodos } from './periodosDb';
import { baseComissao, deltaTurno, diaDoStatement, totalDasLinhas, type LinhasNet } from './statement';
import { buscarAnterior } from './statementDb';
import { dataBRT, diasNoMes, somarDias } from './tempo';
import type { Bloco, Cargo, Turno } from './tipos';

const arred = (valor: number) => Math.round(valor * 100) / 100;

/** T6T1 cruza a meia-noite e conta pro dia seguinte no statement (diaDoStatement)
 * — um T6T1 datado 31/07 pertence a agosto, não julho. */
function dentroDoPeriodo(turno: Turno, data: string, inicio: string, fim: string): boolean {
  const dia = diaDoStatement(turno, data);
  return dia >= inicio && dia <= fim;
}

/**
 * Quantos dias do mês `mes` ('YYYY-MM') já passaram, olhando a data de hoje.
 * Mês futuro (ainda não começou) = 0. Mês já fechado = todos os dias dele.
 */
function diasPassadosDoMes(mes: string, hoje: string): number {
  const mesDeHoje = hoje.slice(0, 7);
  if (mesDeHoje < mes) return 0;
  if (mesDeHoje > mes) return diasNoMes(mes);
  return Number(hoje.slice(8, 10));
}

/** Projeção linear de fim de mês: ritmo de venda até hoje, extrapolado pro mês inteiro. */
function projecaoDoMes(vendido: number, diasPassados: number, diasDoMes: number): number | null {
  if (diasPassados <= 0) return null;
  return Math.round((vendido / diasPassados) * diasDoMes * 100) / 100;
}

export type VendaDeModelo = {
  repId: string;
  repCargo: Cargo;
  modeloId: string;
  modeloBloco: Bloco;
  turno: Turno;
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
  const periodos = await buscarPeriodos(db);
  const vendas: VendaDeModelo[] = [];

  // Um shift+modelo por linha, com o statement já resolvido — a busca do
  // anterior de cada um (2 idas ao banco) roda em paralelo, não uma de cada
  // vez: turno errado, mas sequencial, deixava a página inteira (/, /invoice,
  // /primaris) esperando um round-trip atrás do outro, um por combinação
  // shift×modelo (dezenas a centenas por mês).
  const tarefas: {
    shift: LinhaShift;
    modeloId: string;
    statement: LinhaShift['shift_logs'][number]['statements'][number];
  }[] = [];
  for (const shift of shifts) {
    const log = shift.shift_logs[0];
    if (!log || !shift.rep_id || !shift.reps) continue;

    for (const { model_id } of log.shift_log_models) {
      const statement = log.statements.find((s) => s.model_id === model_id) ?? null;
      if (!statement) continue;
      tarefas.push({ shift, modeloId: model_id, statement });
    }
  }

  const anteriores = await Promise.all(
    tarefas.map((t) => buscarAnterior(db, t.shift.turno, t.shift.data, t.modeloId)),
  );

  tarefas.forEach((t, i) => {
    const anterior = anteriores[i];
    if (anterior.tipo === 'pendente') return;

    const linhasAtuais: LinhasNet = {
      assinaturas: Number(t.statement.net_assinaturas),
      gorjetas: Number(t.statement.net_gorjetas),
      publicacoes: Number(t.statement.net_publicacoes),
      mensagens: Number(t.statement.net_mensagens),
      indicacoes: Number(t.statement.net_indicacoes),
    };
    const anteriorLinhas = anterior.tipo === 'ok' ? anterior.linhas : null;
    const delta = deltaTurno(linhasAtuais, anteriorLinhas);

    const dia = diaDoStatement(t.shift.turno, t.shift.data);
    const bloco = blocoNaData(periodos, t.modeloId, dia);
    if (bloco === null) return; // defensivo: sem período cobrindo, não atribui a nenhum time

    vendas.push({
      repId: t.shift.rep_id!,
      repCargo: t.shift.reps!.cargo,
      modeloId: t.modeloId,
      modeloBloco: bloco,
      turno: t.shift.turno,
      vendidoTotal: totalDasLinhas(delta),
      vendidoComissionavel: baseComissao(delta),
    });
  });

  // Turno Extra de modelo do roster (ex. Kaylin) conta pra venda da empresa
  // exatamente como um turno normal — mesma meta de página, mesmo bônus de
  // liderança. Modelo de fora (nome_livre) nunca entra aqui — só invoice
  // pessoal de quem reportou (lib/turnosExtraDb.ts, intocado por esta busca).
  const { data: extrasData } = await db
    .from('turnos_extra')
    .select(
      'data, turno, rep_id, reps(cargo), model_id, models(bloco), net_assinaturas, net_gorjetas, net_publicacoes, net_mensagens, net_indicacoes, anterior',
    )
    .not('model_id', 'is', null)
    .gte('data', inicioBusca)
    .lte('data', fim);

  type LinhaExtra = {
    data: string;
    turno: Turno;
    rep_id: string;
    reps: { cargo: Cargo } | null;
    model_id: string;
    models: { bloco: Bloco } | null;
    net_assinaturas: number;
    net_gorjetas: number;
    net_publicacoes: number;
    net_mensagens: number;
    net_indicacoes: number;
    anterior: LinhasNet | null;
  };

  for (const e of ((extrasData ?? []) as unknown as LinhaExtra[]).filter((e) =>
    dentroDoPeriodo(e.turno, e.data, inicio, fim),
  )) {
    if (!e.reps || !e.models) continue;
    const atuais: LinhasNet = {
      assinaturas: Number(e.net_assinaturas),
      gorjetas: Number(e.net_gorjetas),
      publicacoes: Number(e.net_publicacoes),
      mensagens: Number(e.net_mensagens),
      indicacoes: Number(e.net_indicacoes),
    };
    const delta = deltaTurno(atuais, e.anterior);

    const dia = diaDoStatement(e.turno, e.data);
    const bloco = blocoNaData(periodos, e.model_id, dia);
    if (bloco === null) continue;

    vendas.push({
      repId: e.rep_id,
      repCargo: e.reps.cargo,
      modeloId: e.model_id,
      modeloBloco: bloco,
      turno: e.turno,
      vendidoTotal: totalDasLinhas(delta),
      vendidoComissionavel: baseComissao(delta),
    });
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
  /** Ritmo de venda até hoje, extrapolado pro mês inteiro — null antes do mês começar. */
  projecao: number | null;
  percentualProjetado: number | null;
};

export type ResumoPrimaris = {
  porRep: {
    repId: string;
    nomeCurto: string;
    cargo: Cargo;
    vendido: number;
    /** Meta parcial: só os turnos que ele já trabalhou no mês — a mesma conta do dashboard pessoal. */
    meta: number;
    percentual: number | null;
  }[];
  porPagina: ResumoPagina[];
} & MetasDosTimes;

export type MetaBarra = { vendido: number; meta: number; percentual: number | null };

export type MetasDosTimes = {
  porTime: Record<Bloco, MetaBarra>;
  total: MetaBarra;
};

/**
 * Vendido x meta prorateada de cada time e do Vortex inteiro, a partir das
 * vendas já buscadas. Pura — divide a conta entre /primaris (resumo completo)
 * e a home (só estas barras).
 */
function calcularMetasDosTimes(
  vendas: VendaDeModelo[],
  models: { id: string; meta_mensal: number }[],
  periodos: Periodo[],
  inicio: string,
  fim: string,
): MetasDosTimes {
  const diasDoMes = diasNoMes(inicio.slice(0, 7));
  const porTime = {} as Record<Bloco, MetaBarra>;
  for (const bloco of ['I', 'II'] as Bloco[]) {
    const vendido = arred(
      vendas.filter((v) => v.modeloBloco === bloco).reduce((s, v) => s + v.vendidoTotal, 0),
    );
    const meta = arred(
      models.reduce((s, m) => s + metaProrateada(periodos, m.id, m.meta_mensal, inicio, fim, diasDoMes)[bloco], 0),
    );
    porTime[bloco] = { vendido, meta, percentual: percentualAtingido(vendido, meta) };
  }
  const vendido = arred(porTime.I.vendido + porTime.II.vendido);
  const meta = arred(porTime.I.meta + porTime.II.meta);
  return { porTime, total: { vendido, meta, percentual: percentualAtingido(vendido, meta) } };
}

/** Resumo pra aba /primaris e pro bloco "Metas do time" da home: quem vendeu
 *  quanto, cada página, cada time e o Vortex inteiro. */
export async function buscarResumoPrimaris(
  db: SupabaseClient,
  inicio: string,
  fim: string,
): Promise<ResumoPrimaris> {
  const [vendas, { data: repsData }, { data: modelsData }, periodos] = await Promise.all([
    buscarVendasDaEmpresa(db, inicio, fim),
    db.from('reps').select('id, nome_curto, cargo').eq('ativo', true).order('nome_curto'),
    db.from('models').select('id, nome, bloco, meta_mensal, ativa').order('bloco').order('nome'),
    buscarPeriodos(db),
  ]);

  const reps = (repsData ?? []) as { id: string; nome_curto: string; cargo: Cargo }[];
  const models = (modelsData ?? []) as { id: string; nome: string; bloco: Bloco; meta_mensal: number; ativa: boolean }[];
  const modelsAtivos = models.filter((m) => m.ativa);
  const metaPorModelo = new Map(modelsAtivos.map((m) => [m.id, m.meta_mensal]));
  // inicio é sempre o primeiro dia do mês (limitesDoMes) — dá pra tirar o mês
  // direto dele sem precisar de mais um parâmetro.
  const mes = inicio.slice(0, 7);
  const diasDoMes = diasNoMes(mes);
  const diasPassados = diasPassadosDoMes(mes, dataBRT());

  const vendidoPorRep = new Map<string, number>();
  const vendidoPorModelo = new Map<string, number>();
  const metaPorRep = new Map<string, number>();
  for (const v of vendas) {
    vendidoPorRep.set(v.repId, (vendidoPorRep.get(v.repId) ?? 0) + v.vendidoTotal);
    vendidoPorModelo.set(v.modeloId, (vendidoPorModelo.get(v.modeloId) ?? 0) + v.vendidoTotal);
    // Meta parcial: soma a meta diária de cada modelo nos turnos que ele já
    // trabalhou, mesma conta do dashboard pessoal — dá pra comparar o
    // ritmo de vendas mesmo antes do mês fechar.
    const metaDaPagina = metaDiariaDaPagina(metaPorModelo.get(v.modeloId) ?? 0, v.turno, diasDoMes);
    metaPorRep.set(v.repId, (metaPorRep.get(v.repId) ?? 0) + metaDaPagina);
  }

  const porRep = reps
    .map((r) => {
      const vendido = arred(vendidoPorRep.get(r.id) ?? 0);
      const meta = arred(metaPorRep.get(r.id) ?? 0);
      return {
        repId: r.id,
        nomeCurto: r.nome_curto,
        cargo: r.cargo,
        vendido,
        meta,
        percentual: percentualAtingido(vendido, meta),
      };
    })
    .sort((a, b) => b.vendido - a.vendido);

  const porPagina: ResumoPagina[] = modelsAtivos.map((m) => {
    const vendido = arred(vendidoPorModelo.get(m.id) ?? 0);
    const projecao = projecaoDoMes(vendido, diasPassados, diasDoMes);
    return {
      modeloId: m.id,
      nome: m.nome,
      bloco: m.bloco,
      vendido,
      meta: m.meta_mensal,
      percentual: percentualAtingido(vendido, m.meta_mensal),
      projecao,
      percentualProjetado: projecao === null ? null : percentualAtingido(projecao, m.meta_mensal),
    };
  });

  const { porTime, total } = calcularMetasDosTimes(vendas, models, periodos, inicio, fim);

  return { porRep, porPagina, porTime, total };
}

export type EventoHistorico = {
  modeloNome: string;
  blocoOrigem: Bloco;
  blocoDestino: Bloco | null; // null = desativada, sem período novo aberto
  data: string; // data em que o período fechou
  vendido: number;
};

/** Trocas de time / desativações que fecharam um período dentro de [inicio, fim]. */
export async function buscarHistoricoModelos(
  db: SupabaseClient,
  inicio: string,
  fim: string,
): Promise<EventoHistorico[]> {
  const { data: periodosData } = await db
    .from('model_bloco_periodos')
    .select('model_id, bloco, inicio, fim, models(nome)')
    .not('fim', 'is', null)
    .gte('fim', inicio)
    .lte('fim', fim)
    .order('fim');

  type LinhaPeriodoFechado = {
    model_id: string;
    bloco: Bloco;
    inicio: string;
    fim: string;
    models: { nome: string } | null;
  };
  const fechados = (periodosData ?? []) as unknown as LinhaPeriodoFechado[];
  if (fechados.length === 0) return [];

  const modeloIds = [...new Set(fechados.map((p) => p.model_id))];
  const { data: todosData } = await db
    .from('model_bloco_periodos')
    .select('model_id, bloco, inicio, fim')
    .in('model_id', modeloIds);
  const todos = (todosData ?? []) as { model_id: string; bloco: Bloco; inicio: string; fim: string | null }[];

  const eventos: EventoHistorico[] = [];
  for (const periodo of fechados) {
    if (!periodo.models) continue;
    const destino = todos.find((t) => t.model_id === periodo.model_id && t.inicio === periodo.fim);
    const vendasDoPeriodo = await buscarVendasDaEmpresa(
      db,
      periodo.inicio > inicio ? periodo.inicio : inicio,
      somarDias(periodo.fim, -1),
    );
    const vendido = arred(
      vendasDoPeriodo
        .filter((v) => v.modeloId === periodo.model_id)
        .reduce((s, v) => s + v.vendidoTotal, 0),
    );
    eventos.push({
      modeloNome: periodo.models.nome,
      blocoOrigem: periodo.bloco,
      blocoDestino: destino ? destino.bloco : null,
      data: periodo.fim,
      vendido,
    });
  }
  return eventos;
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

// Busca de metas e recordes contra o banco. Compartilhado entre a tela de
// admin do rep e o dashboard pessoal — os dois mostram os mesmos números,
// só que um pra qualquer rep (admin) e outro pro rep logado.

import type { SupabaseClient } from '@supabase/supabase-js';
import { calcularMetas, metaDiariaDaPagina, percentualAtingido, type TurnoParaMeta } from './meta';
import { deltaTurno, diaDoStatement, totalDasLinhas, type LinhasNet } from './statement';
import { buscarAnterior } from './statementDb';
import { somarDias } from './tempo';
import type { Bloco, Model, Turno } from './tipos';

/** T6T1 cruza a meia-noite e conta pro dia seguinte no statement (diaDoStatement)
 * — um T6T1 datado 31/07 pertence a agosto, não julho. */
function dentroDoPeriodo(turno: Turno, data: string, inicio: string, fim: string): boolean {
  const dia = diaDoStatement(turno, data);
  return dia >= inicio && dia <= fim;
}

type LinhaShift = {
  id: string;
  data: string;
  turno: Turno;
  bloco: Bloco;
  shift_logs: {
    shift_log_models: { model_id: string; models: { nome: string; meta_mensal: number } }[];
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

export type VendaDaPaginaNoTurno = { nome: string; vendido: number; meta: number };

export type LinhaMetaTurno = {
  data: string;
  turno: Turno;
  paginas: string[];
  /** true quando as páginas mostradas são o roster do time, não a modelo real trabalhada. */
  planejado: boolean;
  metaDoTurno: number;
  vendido: number;
  /** Vendido e meta por página — só preenchido quando trabalhado (double tem mais de uma). */
  porPagina: VendaDaPaginaNoTurno[];
  pendente: boolean;
  trabalhado: boolean;
};

export type MetasDoPeriodo = {
  linhas: LinhaMetaTurno[];
  metaTotal: number;
  metaParcial: number;
  turnosFeitos: number;
  totalVendido: number;
  percentualTotal: number | null;
  percentualParcial: number | null;
};

/** O que este rep vendeu num turno: a soma dos deltas de cada modelo trabalhada — nunca o acumulado bruto do print.
 * A busca do anterior de cada modelo roda em paralelo (double é no máximo
 * duas, mas isso também é chamado shift a shift em loop — ver os dois
 * lugares que chamam esta função). */
async function vendidoDoTurno(
  db: SupabaseClient,
  turno: Turno,
  data: string,
  modelos: { id: string }[],
  statements: LinhaShift['shift_logs'][number]['statements'],
): Promise<{ vendido: number; pendente: boolean; porPagina: { id: string; vendido: number }[] }> {
  const anteriores = await Promise.all(
    modelos.map(({ id: modeloId }) => buscarAnterior(db, turno, data, modeloId)),
  );

  let vendido = 0;
  let pendente = false;
  const porPagina: { id: string; vendido: number }[] = [];

  modelos.forEach(({ id: modeloId }, i) => {
    const statement = statements.find((s) => s.model_id === modeloId) ?? null;
    const anterior = anteriores[i];
    if (!statement || anterior.tipo === 'pendente') {
      pendente = true;
      return;
    }
    const linhasAtuais: LinhasNet = {
      assinaturas: Number(statement.net_assinaturas),
      gorjetas: Number(statement.net_gorjetas),
      publicacoes: Number(statement.net_publicacoes),
      mensagens: Number(statement.net_mensagens),
      indicacoes: Number(statement.net_indicacoes),
    };
    const anteriorLinhas = anterior.tipo === 'ok' ? anterior.linhas : null;
    const vendidoPagina = totalDasLinhas(deltaTurno(linhasAtuais, anteriorLinhas));
    vendido += vendidoPagina;
    porPagina.push({ id: modeloId, vendido: vendidoPagina });
  });

  return { vendido, pendente, porPagina };
}

/**
 * Turnos regulares do rep no período, com a meta mensal de cada página —
 * real (shift_log_models) se o turno já foi trabalhado, roster do time
 * (fallback, igual ao /schedule) se ainda não.
 */
export async function buscarMetasDoRep(
  db: SupabaseClient,
  repId: string,
  inicio: string,
  fim: string,
  diasDoMes: number,
): Promise<MetasDoPeriodo> {
  // Busca desde um dia antes: um T6T1 do fim do mês anterior pode pertencer a
  // este período (diaDoStatement), mas sua `data` fica fora da janela crua.
  const inicioBusca = somarDias(inicio, -1);

  const [{ data: shiftsData }, { data: modelsData }] = await Promise.all([
    db
      .from('shifts')
      .select(
        'id, data, turno, bloco, shift_logs(shift_log_models(model_id, models(nome, meta_mensal)), statements(model_id, net_assinaturas, net_gorjetas, net_publicacoes, net_mensagens, net_indicacoes))',
      )
      .eq('rep_id', repId)
      .eq('funcao', 'regular')
      .gte('data', inicioBusca)
      .lte('data', fim)
      .order('data'),
    db.from('models').select('*').eq('ativa', true).eq('extra', false),
  ]);

  const shifts = ((shiftsData ?? []) as unknown as LinhaShift[]).filter((s) =>
    dentroDoPeriodo(s.turno, s.data, inicio, fim),
  );
  const roster = (modelsData ?? []) as Model[];

  // Páginas de cada turno resolvidas primeiro (síncrono), pra depois buscar
  // o vendido de todos os turnos trabalhados em paralelo — sequencial aqui
  // significava um round-trip atrás do outro pra cada turno do mês inteiro.
  const paginasPorShift = shifts.map((shift) => {
    const log = shift.shift_logs[0];
    const trabalhado = !!log;
    const paginas = trabalhado
      ? log!.shift_log_models.map((m) => ({ id: m.model_id, nome: m.models.nome, meta: m.models.meta_mensal }))
      : roster.filter((m) => m.bloco === shift.bloco).map((m) => ({ id: m.id, nome: m.nome, meta: m.meta_mensal }));
    return { shift, log, trabalhado, paginas };
  });

  const vendidos = await Promise.all(
    paginasPorShift.map(({ shift, log, trabalhado, paginas }) =>
      trabalhado
        ? vendidoDoTurno(db, shift.turno, shift.data, paginas, log!.statements)
        : Promise.resolve({ vendido: 0, pendente: false, porPagina: [] as { id: string; vendido: number }[] }),
    ),
  );

  const turnosParaMeta: TurnoParaMeta[] = [];
  const linhas: LinhaMetaTurno[] = [];
  let totalVendido = 0;

  paginasPorShift.forEach(({ shift, trabalhado, paginas }, i) => {
    turnosParaMeta.push({
      turno: shift.turno,
      metasDasPaginas: paginas.map((p) => p.meta),
      trabalhado,
    });

    const { vendido, pendente, porPagina } = vendidos[i];

    totalVendido += vendido;

    const metaDoTurno = paginas.reduce(
      (soma, p) => soma + metaDiariaDaPagina(p.meta, shift.turno, diasDoMes),
      0,
    );

    const porPaginaComMeta: VendaDaPaginaNoTurno[] = porPagina.map((p) => {
      const pagina = paginas.find((pg) => pg.id === p.id);
      return {
        nome: pagina?.nome ?? '',
        vendido: p.vendido,
        meta: metaDiariaDaPagina(pagina?.meta ?? 0, shift.turno, diasDoMes),
      };
    });

    linhas.push({
      data: shift.data,
      turno: shift.turno,
      paginas: paginas.map((p) => p.nome),
      planejado: !trabalhado,
      metaDoTurno,
      vendido,
      porPagina: porPaginaComMeta,
      pendente,
      trabalhado,
    });
  });

  const { metaTotal, metaParcial, turnosFeitos } = calcularMetas(turnosParaMeta, diasDoMes);
  const totalVendidoArred = Math.round(totalVendido * 100) / 100;

  return {
    linhas,
    metaTotal,
    metaParcial,
    turnosFeitos,
    totalVendido: totalVendidoArred,
    percentualTotal: percentualAtingido(totalVendidoArred, metaTotal),
    percentualParcial: percentualAtingido(totalVendidoArred, metaParcial),
  };
}

export type RecordeTurno = { data: string; turno: Turno; valor: number } | null;

/**
 * O turno com maior venda do rep em toda a história — a soma dos deltas de
 * cada modelo trabalhada (nunca o acumulado bruto do print, sempre
 * descontado o turno anterior da cadeia). Só considera turnos já
 * trabalhados; sem filtro de data — turno sem `shift_log` já cai fora
 * sozinho, e dado de teste anterior à âncora da escala também deve contar.
 */
export async function buscarRecordeDoRep(db: SupabaseClient, repId: string): Promise<RecordeTurno> {
  const { data: shiftsData } = await db
    .from('shifts')
    .select(
      'data, turno, shift_logs(shift_log_models(model_id), statements(model_id, net_assinaturas, net_gorjetas, net_publicacoes, net_mensagens, net_indicacoes))',
    )
    .eq('rep_id', repId)
    .eq('funcao', 'regular')
    .order('data');

  const shifts = ((shiftsData ?? []) as unknown as Omit<LinhaShift, 'id' | 'bloco'>[]).filter(
    (s) => s.shift_logs[0],
  );

  // Sem filtro de data (é o recorde de todos os tempos) — o histórico só
  // cresce, então isso tem que rodar em paralelo, nunca turno a turno.
  const vendidos = await Promise.all(
    shifts.map((shift) => {
      const log = shift.shift_logs[0];
      const modelos = log.shift_log_models.map((m) => ({ id: m.model_id }));
      return vendidoDoTurno(db, shift.turno, shift.data, modelos, log.statements);
    }),
  );

  let recorde: RecordeTurno = null;
  shifts.forEach((shift, i) => {
    const { vendido } = vendidos[i];
    if (!recorde || vendido > recorde.valor) {
      recorde = { data: shift.data, turno: shift.turno, valor: Math.round(vendido * 100) / 100 };
    }
  });

  return recorde;
}

export type ResumoDoTurno = { resumo: string | null; assistNome: string | null };

type LinhaRegularResumo = {
  data: string;
  turno: Turno;
  bloco: Bloco;
  shift_logs: { resumo: string | null }[];
};

type LinhaAssistResumo = {
  data: string;
  turno: Turno;
  bloco: Bloco;
  reps: { nome_curto: string } | null;
};

/**
 * Resumo escrito no fechamento + nome de quem assistiu, por turno do rep —
 * pro "detalhes" do histórico de /turno. Cliente admin de propósito: o
 * assistente é outro rep, e a RLS comum não deixa o regular ler o shift de
 * outra pessoa (mesmo motivo do `temAssistente` calculado ao vivo).
 */
export async function buscarResumosDoRep(
  db: SupabaseClient,
  repId: string,
  inicio: string,
  fim: string,
): Promise<Map<string, ResumoDoTurno>> {
  const inicioBusca = somarDias(inicio, -1);

  const [{ data: regularData }, { data: assistData }] = await Promise.all([
    db
      .from('shifts')
      .select('data, turno, bloco, shift_logs(resumo)')
      .eq('rep_id', repId)
      .eq('funcao', 'regular')
      .gte('data', inicioBusca)
      .lte('data', fim),
    db
      .from('shifts')
      .select('data, turno, bloco, reps(nome_curto)')
      .eq('funcao', 'assist')
      .gte('data', inicioBusca)
      .lte('data', fim),
  ]);

  const assistPorSlot = new Map<string, string>();
  for (const a of (assistData ?? []) as unknown as LinhaAssistResumo[]) {
    if (a.reps?.nome_curto) assistPorSlot.set(`${a.data}|${a.turno}|${a.bloco}`, a.reps.nome_curto);
  }

  const mapa = new Map<string, ResumoDoTurno>();
  for (const r of (regularData ?? []) as unknown as LinhaRegularResumo[]) {
    mapa.set(`${r.data}|${r.turno}`, {
      resumo: r.shift_logs[0]?.resumo ?? null,
      assistNome: assistPorSlot.get(`${r.data}|${r.turno}|${r.bloco}`) ?? null,
    });
  }

  return mapa;
}

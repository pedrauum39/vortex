// Leitura/escrita da tabela turnos_extra — nunca passa por
// shifts/shift_logs/statements, de propósito (ver docs/superpowers/specs/
// 2026-08-18-turno-extra-design.md). Cada linha já vem com o print de agora
// e, quando o turno não é T6T1, o print anterior digitado/lido na hora — o
// "vendido" é sempre o delta entre os dois (lib/statement.ts:deltaTurno).

import type { SupabaseClient } from '@supabase/supabase-js';
import { comissaoTurnoExtra } from './comissao';
import { buscarRegraVigente } from './comissaoDb';
import { baseComissao, deltaTurno, totalDasLinhas, type LinhasNet } from './statement';
import type { Cargo, Turno } from './tipos';

type LinhaCrua = {
  id: string;
  data: string;
  turno: Turno;
  model_id: string | null;
  nome_livre: string | null;
  models: { nome: string } | null;
  net_assinaturas: number;
  net_gorjetas: number;
  net_publicacoes: number;
  net_mensagens: number;
  net_indicacoes: number;
  anterior: LinhasNet | null;
};

const CAMPOS =
  'id, data, turno, model_id, nome_livre, models(nome), net_assinaturas, net_gorjetas, net_publicacoes, net_mensagens, net_indicacoes, anterior';

function linhasAtuais(l: LinhaCrua): LinhasNet {
  return {
    assinaturas: Number(l.net_assinaturas),
    gorjetas: Number(l.net_gorjetas),
    publicacoes: Number(l.net_publicacoes),
    mensagens: Number(l.net_mensagens),
    indicacoes: Number(l.net_indicacoes),
  };
}

export type LinhaTurnoExtra = {
  id: string;
  data: string;
  turno: Turno;
  modeloNome: string;
  vendido: number;
  comissao: number;
};

async function montarLinha(
  db: SupabaseClient,
  l: LinhaCrua,
  cargo: Cargo,
  data: string,
): Promise<LinhaTurnoExtra> {
  const delta = deltaTurno(linhasAtuais(l), l.anterior);
  const regra = await buscarRegraVigente(db, data);
  return {
    id: l.id,
    data: l.data,
    turno: l.turno,
    modeloNome: l.models?.nome ?? l.nome_livre ?? '',
    vendido: totalDasLinhas(delta),
    comissao: comissaoTurnoExtra(baseComissao(delta), cargo, regra),
  };
}

/** Lançamentos do próprio rep no período — pro histórico em /turno e a linha extra no /invoice. */
export async function buscarTurnosExtraDoRep(
  db: SupabaseClient,
  repId: string,
  cargo: Cargo,
  inicio: string,
  fim: string,
): Promise<LinhaTurnoExtra[]> {
  const { data } = await db
    .from('turnos_extra')
    .select(CAMPOS)
    .eq('rep_id', repId)
    .gte('data', inicio)
    .lte('data', fim)
    .order('data');

  const linhas = (data ?? []) as unknown as LinhaCrua[];
  return Promise.all(linhas.map((l) => montarLinha(db, l, cargo, l.data)));
}

/** Todos os lançamentos do período, com o nome de quem reportou — pra tela de correção em /admin/turnos. */
export async function buscarTurnosExtraAdmin(
  db: SupabaseClient,
  inicio: string,
  fim: string,
): Promise<(LinhaTurnoExtra & { repNome: string })[]> {
  const { data } = await db
    .from('turnos_extra')
    .select(`${CAMPOS}, reps(nome_curto, cargo)`)
    .gte('data', inicio)
    .lte('data', fim)
    .order('data');

  const linhas = (data ?? []) as unknown as (LinhaCrua & { reps: { nome_curto: string; cargo: Cargo } | null })[];
  return Promise.all(
    linhas.map(async (l) => ({
      ...(await montarLinha(db, l, l.reps?.cargo ?? 'tertius', l.data)),
      repNome: l.reps?.nome_curto ?? '—',
    })),
  );
}

export type DadosTurnoExtra = {
  id: string;
  repId: string;
  data: string;
  turno: Turno;
  modeloId: string | null;
  nomeLivre: string | null;
  atual: LinhasNet;
  anterior: LinhasNet | null;
  imagemAtualPath: string | null;
  ocrAtualRaw: unknown;
  imagemAnteriorPath: string | null;
  ocrAnteriorRaw: unknown;
};

export async function lancarTurnoExtra(db: SupabaseClient, dados: DadosTurnoExtra): Promise<void> {
  const { error } = await db.from('turnos_extra').insert({
    id: dados.id,
    rep_id: dados.repId,
    data: dados.data,
    turno: dados.turno,
    model_id: dados.modeloId,
    nome_livre: dados.nomeLivre,
    net_assinaturas: dados.atual.assinaturas,
    net_gorjetas: dados.atual.gorjetas,
    net_publicacoes: dados.atual.publicacoes,
    net_mensagens: dados.atual.mensagens,
    net_indicacoes: dados.atual.indicacoes,
    anterior: dados.anterior,
    imagem_atual_path: dados.imagemAtualPath,
    ocr_atual_raw: dados.ocrAtualRaw,
    imagem_anterior_path: dados.imagemAnteriorPath,
    ocr_anterior_raw: dados.ocrAnteriorRaw,
  });
  if (error) throw new Error(error.message);
}

export async function apagarTurnoExtra(db: SupabaseClient, id: string): Promise<void> {
  const { error } = await db.from('turnos_extra').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

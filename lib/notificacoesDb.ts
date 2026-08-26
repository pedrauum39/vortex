// Acesso a dados de notificacoes/notificacao_destinatarios. Sem tipos
// gerados do Supabase (este projeto não usa) — cast manual como em todo
// outro *Db.ts (ver lib/statementDb.ts, lib/periodosDb.ts).

import type { SupabaseClient } from '@supabase/supabase-js';
import { estaVisivelHoje, type Notificacao, type TipoNotificacao } from './notificacoes';

export type NotificacaoComDestinatarios = Notificacao & {
  destinatarios: { repId: string; nomeCurto: string; lidaEm: string | null }[];
};

type LinhaNotificacaoAdmin = {
  id: string;
  tipo: TipoNotificacao;
  mensagem: string;
  data_inicio: string | null;
  data_fim: string | null;
  ativo: boolean;
  criado_em: string;
  notificacao_destinatarios: { rep_id: string; lida_em: string | null; reps: { nome_curto: string } | null }[];
};

const CAMPOS_ADMIN =
  'id, tipo, mensagem, data_inicio, data_fim, ativo, criado_em, notificacao_destinatarios(rep_id, lida_em, reps(nome_curto))';

/** Todas as notificações, com quem é alvo e quem já confirmou — pra montar
 * as abas Ativas/Encerradas e o "ver quem" no admin. */
export async function buscarNotificacoesAdmin(db: SupabaseClient): Promise<NotificacaoComDestinatarios[]> {
  const { data, error } = await db
    .from('notificacoes')
    .select(CAMPOS_ADMIN)
    .order('criado_em', { ascending: false });
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as LinhaNotificacaoAdmin[]).map((n) => ({
    id: n.id,
    tipo: n.tipo,
    mensagem: n.mensagem,
    dataInicio: n.data_inicio,
    dataFim: n.data_fim,
    ativo: n.ativo,
    criadoEm: n.criado_em,
    destinatarios: n.notificacao_destinatarios.map((d) => ({
      repId: d.rep_id,
      nomeCurto: d.reps?.nome_curto ?? '—',
      lidaEm: d.lida_em,
    })),
  }));
}

export type NotificacoesPendentes = {
  popups: { id: string; mensagem: string }[];
  avisos: { id: string; mensagem: string }[];
  todos: { id: string; mensagem: string }[];
};

type LinhaPendente = {
  notificacoes: {
    id: string;
    tipo: TipoNotificacao;
    mensagem: string;
    data_inicio: string | null;
    data_fim: string | null;
    ativo: boolean;
    criado_em: string;
  } | null;
};

/** Notificações que o rep ainda não confirmou E que já são visíveis hoje
 * (filtra aviso fora do período; desativada nunca entra aqui — ver
 * estaVisivelHoje). Ordenado do mais antigo pro mais novo, separado por
 * tipo — quem chama decide como renderizar cada um. */
export async function buscarNotificacoesPendentesDoRep(
  db: SupabaseClient,
  repId: string,
  hoje: string,
): Promise<NotificacoesPendentes> {
  const { data, error } = await db
    .from('notificacao_destinatarios')
    .select('notificacoes(id, tipo, mensagem, data_inicio, data_fim, ativo, criado_em)')
    .eq('rep_id', repId)
    .is('lida_em', null);
  if (error) throw new Error(error.message);

  const pendentes = ((data ?? []) as unknown as LinhaPendente[])
    .map((l) => l.notificacoes)
    .filter((n): n is NonNullable<typeof n> => n !== null)
    .filter((n) =>
      estaVisivelHoje({ tipo: n.tipo, dataInicio: n.data_inicio, dataFim: n.data_fim, ativo: n.ativo }, hoje),
    )
    .sort((a, b) => (a.criado_em < b.criado_em ? -1 : a.criado_em > b.criado_em ? 1 : 0));

  return {
    popups: pendentes.filter((n) => n.tipo === 'popup').map((n) => ({ id: n.id, mensagem: n.mensagem })),
    avisos: pendentes.filter((n) => n.tipo === 'aviso').map((n) => ({ id: n.id, mensagem: n.mensagem })),
    todos: pendentes.filter((n) => n.tipo === 'todo').map((n) => ({ id: n.id, mensagem: n.mensagem })),
  };
}

/** Cria a notificação e materializa uma linha de destinatário por rep alvo —
 * "marcar todos" no formulário só significa marcar todos os checkboxes
 * antes de chamar isto aqui, o insert é o mesmo. */
export async function criarNotificacao(
  db: SupabaseClient,
  dados: {
    tipo: TipoNotificacao;
    mensagem: string;
    dataInicio: string | null;
    dataFim: string | null;
    repIds: string[];
  },
): Promise<void> {
  if (dados.repIds.length === 0) throw new Error('Escolha ao menos um destinatário.');
  if (!dados.mensagem.trim()) throw new Error('A mensagem não pode ficar vazia.');

  const { data: notificacao, error } = await db
    .from('notificacoes')
    .insert({
      tipo: dados.tipo,
      mensagem: dados.mensagem,
      data_inicio: dados.dataInicio,
      data_fim: dados.dataFim,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  const { error: erroDestinatarios } = await db
    .from('notificacao_destinatarios')
    .insert(dados.repIds.map((repId) => ({ notificacao_id: notificacao.id, rep_id: repId })));
  if (erroDestinatarios) throw new Error(erroDestinatarios.message);
}

/** Tira do ar pra todo mundo na hora — não apaga a linha, só marca ativo=false,
 * então o histórico de quem já tinha confirmado antes continua no "ver quem". */
export async function desativarNotificacao(db: SupabaseClient, id: string): Promise<void> {
  const { error } = await db.from('notificacoes').update({ ativo: false }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Grava a confirmação do rep — "Fechar"/"Já vi"/"Já fiz" chamam esta mesma
 * função, só o rótulo do botão muda por tipo (ver ROTULO_CONFIRMAR). */
export async function confirmarNotificacao(
  db: SupabaseClient,
  notificacaoId: string,
  repId: string,
): Promise<void> {
  const { error } = await db
    .from('notificacao_destinatarios')
    .update({ lida_em: new Date().toISOString() })
    .eq('notificacao_id', notificacaoId)
    .eq('rep_id', repId);
  if (error) throw new Error(error.message);
}

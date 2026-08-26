-- Índice faltando: a PK de notificacao_destinatarios é (notificacao_id, rep_id),
-- mas buscarNotificacoesPendentesDoRep() filtra só por rep_id (a segunda coluna
-- do composto, não usável pelo planner) — e essa consulta roda em toda
-- navegação de todo usuário logado (layout raiz + dashboard). Parcial em
-- lida_em is null porque é sempre isso que a query filtra.
create index notificacao_destinatarios_rep_idx on notificacao_destinatarios (rep_id) where lida_em is null;

-- 0023 revogou UPDATE de authenticated (deixando só a coluna lida_em), mas
-- esqueceu de revogar de anon também — convenção do projeto (ver escala_time,
-- 0002_rls.sql) é sempre incluir anon no revoke, mesmo quando não há policy
-- pra esse role hoje (RLS já nega tudo pra anon nesta tabela por falta de
-- policy "to anon" — isto é defesa em profundidade pro caso de uma policy
-- futura esquecer o "to authenticated").
revoke update on notificacao_destinatarios from anon;

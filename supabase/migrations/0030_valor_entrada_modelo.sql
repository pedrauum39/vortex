-- Valor (net) que a modelo já tinha antes de entrar pro time — puramente
-- informativo/visual (não entra em nenhum cálculo de comissão). Usado pra
-- mostrar "ela entrou com X, o time fez Y desde então" em /primaris e na home.
alter table models add column valor_entrada numeric not null default 0;

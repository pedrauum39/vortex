-- Meta mensal de vendas de cada página (modelo), usada pra calcular a meta
-- diária por turno (42% T6T1, 28% T2T3, 30% T4T5, dividido pelos dias do
-- mês) na tela de metas do rep em /admin/reps/[id].

alter table models add column meta_mensal numeric not null default 0;

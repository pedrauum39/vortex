-- Histórico da meta mensal de cada modelo, ao longo do tempo — mesma lógica
-- de model_bloco_periodos: toda modelo sempre tem um período aberto (fim is
-- null) = a meta vigente agora. Mudar a meta (admin/models) fecha o período
-- atual e abre um novo com o valor novo, então um mês passado consultado
-- depois continua mostrando a meta que valia NAQUELE mês, não a atual.
create table model_meta_periodos (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references models(id) on delete cascade,
  meta_mensal numeric not null,
  inicio date not null,
  fim date,
  constraint model_meta_periodos_ordem check (fim is null or fim >= inicio)
);

-- Só um período aberto por modelo de cada vez.
create unique index model_meta_periodos_aberto_idx
  on model_meta_periodos (model_id) where fim is null;

create index model_meta_periodos_model_idx on model_meta_periodos (model_id, inicio);

alter table model_meta_periodos enable row level security;

create policy model_meta_periodos_select on model_meta_periodos
  for select to authenticated using (pode_ver());

create policy model_meta_periodos_write on model_meta_periodos
  for all to authenticated using (is_admin()) with check (is_admin());

-- Backfill: sem histórico de quando a meta mudou da última vez antes desta
-- feature existir, cada modelo ganha um único período aberto com a meta
-- ATUAL dela, começando no início do período de bloco mais antigo (mesma
-- data usada pro backfill de model_bloco_periodos) — meses passados vão
-- mostrar essa meta até a próxima mudança feita daqui pra frente.
insert into model_meta_periodos (model_id, meta_mensal, inicio)
select m.id, m.meta_mensal, coalesce(min(p.inicio), current_date)
from models m
left join model_bloco_periodos p on p.model_id = m.id
group by m.id, m.meta_mensal;

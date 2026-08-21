-- Histórico de qual bloco (time) cada modelo pertenceu, ao longo do tempo.
-- Toda modelo sempre tem um período aberto (fim is null) = o time atual.
-- Trocar de time ou desativar fecha o período vigente; reativar/criar abre um novo.
create table model_bloco_periodos (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references models(id) on delete cascade,
  bloco bloco_t not null,
  inicio date not null,
  fim date,
  constraint model_bloco_periodos_ordem check (fim is null or fim >= inicio)
);

-- Só um período aberto por modelo de cada vez.
create unique index model_bloco_periodos_aberto_idx
  on model_bloco_periodos (model_id) where fim is null;

create index model_bloco_periodos_model_idx on model_bloco_periodos (model_id, inicio);

alter table model_bloco_periodos enable row level security;

create policy model_bloco_periodos_select on model_bloco_periodos
  for select to authenticated using (pode_ver());

create policy model_bloco_periodos_write on model_bloco_periodos
  for all to authenticated using (is_admin()) with check (is_admin());

-- Backfill: cada modelo existente ganha um período aberto no bloco atual
-- dela, começando na venda mais antiga já registrada (shift_log_models via
-- shifts, ou turnos_extra) — sem venda nenhuma, começa hoje.
insert into model_bloco_periodos (model_id, bloco, inicio, fim)
select
  m.id,
  m.bloco,
  coalesce(
    least(
      (select min(sh.data) from shift_log_models slm
        join shift_logs sl on sl.id = slm.shift_log_id
        join shifts sh on sh.id = sl.shift_id
        where slm.model_id = m.id),
      (select min(te.data) from turnos_extra te where te.model_id = m.id)
    ),
    current_date
  ),
  null
from models m;

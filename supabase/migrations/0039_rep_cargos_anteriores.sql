-- Cargo por data: reps.cargo é o de hoje; quando um rep muda de cargo, o
-- anterior fica aqui com `ate` = primeiro dia do cargo novo (exclusivo).
-- Turno antes de `ate` paga no cargo antigo (lib/cargo.ts:cargoNaData).

create table rep_cargos_anteriores (
  id      uuid primary key default gen_random_uuid(),
  rep_id  uuid not null references reps (id) on delete cascade,
  cargo   cargo_t not null,
  ate     date not null,
  unique (rep_id, ate)
);

alter table rep_cargos_anteriores enable row level security;

create policy rep_cargos_anteriores_select on rep_cargos_anteriores
  for select to authenticated using (pode_ver());

create policy rep_cargos_anteriores_write on rep_cargos_anteriores
  for all to authenticated using (is_admin()) with check (is_admin());

-- Carol vira Adept Primaris e Carlos vira Secundus a partir de 14/10/2026
-- (início do Time 3). Antes disso, os dois continuam no cargo antigo.
insert into rep_cargos_anteriores (rep_id, cargo, ate)
select id, cargo, '2026-10-14' from reps where nome_curto in ('Carolinne P.', 'Carlos de Lucca');

update reps set cargo = 'adept_primaris' where nome_curto = 'Carolinne P.';
update reps set cargo = 'secundus' where nome_curto = 'Carlos de Lucca';

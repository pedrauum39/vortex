-- Suporte a "double": um rep pode trabalhar 1 ou 2 modelos no mesmo turno. A
-- modelo deixa de ser um campo único em shift_logs e vira uma tabela — uma
-- linha por modelo trabalhada — e o statement passa a ser por modelo, não por
-- turno inteiro.
--
-- statements e shift_logs estão vazias neste momento (conferido antes de
-- escrever esta migração), então não há nada para migrar.

create table shift_log_models (
  id            uuid primary key default gen_random_uuid(),
  shift_log_id  uuid not null references shift_logs (id) on delete cascade,
  model_id      uuid not null references models (id) on delete cascade,
  created_at    timestamptz not null default now(),

  unique (shift_log_id, model_id)
);

alter table shift_logs drop column model_id_real;

-- Um report por (turno, modelo). A cadeia de desconto do dia (lib/statement.ts)
-- passa a comparar contra o statement da MESMA modelo no turno anterior.
alter table statements drop constraint statements_um_por_log;
alter table statements add column model_id uuid not null references models (id);
alter table statements add constraint statements_um_por_log_modelo unique (shift_log_id, model_id);

-- ---------------------------------------------------------------- RLS

alter table shift_log_models enable row level security;

create policy shift_log_models_select on shift_log_models for select to authenticated
  using (
    is_admin() or exists (
      select 1 from shift_logs l
      where l.id = shift_log_models.shift_log_id and l.rep_id = current_rep_id()
    )
  );

create policy shift_log_models_insert on shift_log_models for insert to authenticated
  with check (
    is_admin() or exists (
      select 1 from shift_logs l
      where l.id = shift_log_models.shift_log_id and l.rep_id = current_rep_id()
    )
  );

create policy shift_log_models_update on shift_log_models for update to authenticated
  using (
    is_admin() or exists (
      select 1 from shift_logs l
      where l.id = shift_log_models.shift_log_id and l.rep_id = current_rep_id()
    )
  )
  with check (
    is_admin() or exists (
      select 1 from shift_logs l
      where l.id = shift_log_models.shift_log_id and l.rep_id = current_rep_id()
    )
  );

create policy shift_log_models_delete on shift_log_models for delete to authenticated
  using (is_admin());

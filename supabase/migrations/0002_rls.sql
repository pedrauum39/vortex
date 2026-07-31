-- Row Level Security: "o rep só vê o dele" vive aqui, no banco, e não na UI.
-- Se alguém chamar a API direto com o token de um rep comum, continua bloqueado.

-- ---------------------------------------------------------------- helpers

-- SECURITY DEFINER de propósito: estas funções precisam ler `reps` sem
-- disparar a própria política de `reps`, que as chamaria de volta.
create or replace function public.current_rep_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select id from reps where auth_user_id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from reps where auth_user_id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------- reps

alter table reps enable row level security;

create policy reps_select on reps for select to authenticated
  using (auth_user_id = auth.uid() or is_admin());

create policy reps_admin_write on reps for all to authenticated
  using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------- models

alter table models enable row level security;

create policy models_select on models for select to authenticated
  using (true);

create policy models_admin_write on models for all to authenticated
  using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------- shifts

alter table shifts enable row level security;

-- Estrito: o rep enxerga apenas os próprios turnos. A grade do time inteiro
-- sai da view `escala_time` abaixo, que expõe só nome/turno/bloco.
create policy shifts_select on shifts for select to authenticated
  using (rep_id = current_rep_id() or is_admin());

create policy shifts_admin_write on shifts for all to authenticated
  using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------- shift_logs

alter table shift_logs enable row level security;

create policy shift_logs_select on shift_logs for select to authenticated
  using (rep_id = current_rep_id() or is_admin());

create policy shift_logs_insert on shift_logs for insert to authenticated
  with check (rep_id = current_rep_id() or is_admin());

create policy shift_logs_update on shift_logs for update to authenticated
  using (rep_id = current_rep_id() or is_admin())
  with check (rep_id = current_rep_id() or is_admin());

create policy shift_logs_delete on shift_logs for delete to authenticated
  using (is_admin());

-- ---------------------------------------------------------------- statements

alter table statements enable row level security;

create policy statements_select on statements for select to authenticated
  using (
    is_admin() or exists (
      select 1 from shift_logs l
      where l.id = statements.shift_log_id and l.rep_id = current_rep_id()
    )
  );

create policy statements_insert on statements for insert to authenticated
  with check (
    is_admin() or exists (
      select 1 from shift_logs l
      where l.id = statements.shift_log_id and l.rep_id = current_rep_id()
    )
  );

create policy statements_update on statements for update to authenticated
  using (
    is_admin() or exists (
      select 1 from shift_logs l
      where l.id = statements.shift_log_id and l.rep_id = current_rep_id()
    )
  )
  with check (
    is_admin() or exists (
      select 1 from shift_logs l
      where l.id = statements.shift_log_id and l.rep_id = current_rep_id()
    )
  );

create policy statements_delete on statements for delete to authenticated
  using (is_admin());

-- ---------------------------------------------------------------- commission_rules

alter table commission_rules enable row level security;

-- O rep precisa ler a regra para ver a composição do próprio invoice.
create policy commission_rules_select on commission_rules for select to authenticated
  using (true);

create policy commission_rules_admin_write on commission_rules for all to authenticated
  using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------- view do time

-- A aba "Time" da tela de schedule. SECURITY DEFINER de propósito: atravessa
-- o RLS estrito de `shifts` expondo apenas quem trabalha em qual slot —
-- nenhuma coluna de venda, hora ou comissão passa por aqui.
create view escala_time
with (security_invoker = false) as
select
  s.data,
  s.turno,
  s.bloco,
  s.funcao,
  s.origem,
  r.nome_curto as rep_nome,
  m.nome       as model_nome
from shifts s
left join reps   r on r.id = s.rep_id
left join models m on m.id = s.model_id;

revoke all on escala_time from anon, authenticated;
grant select on escala_time to authenticated;

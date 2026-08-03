-- Thomas (OM) acompanha o time sem fazer parte dele: enxerga schedule/admin/
-- primaris, mas não edita nada. `reps.observador` é a flag; `pode_ver()` é o
-- irmão só-leitura de `is_admin()` — troca só nas políticas de SELECT que já
-- checavam is_admin(). INSERT/UPDATE/DELETE continuam travados só por
-- is_admin() (sem observador) — e a camada de app (lib/auth.ts:ehAdmin())
-- nem deixa a ação chegar até aqui pra um observador, então as duas camadas
-- concordam: ele nunca escreve nada, só o RLS de leitura fica mais aberto.

alter table reps add column observador boolean not null default false;

create or replace function public.pode_ver()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from reps
    where auth_user_id = auth.uid()
      and (role = 'admin' or cargo in ('grand_primaris', 'knight_primaris') or observador)
  );
$$;

drop policy reps_select on reps;
create policy reps_select on reps for select to authenticated
  using (auth_user_id = auth.uid() or pode_ver());

drop policy shifts_select on shifts;
create policy shifts_select on shifts for select to authenticated
  using (rep_id = current_rep_id() or pode_ver());

drop policy shift_logs_select on shift_logs;
create policy shift_logs_select on shift_logs for select to authenticated
  using (rep_id = current_rep_id() or pode_ver());

drop policy statements_select on statements;
create policy statements_select on statements for select to authenticated
  using (
    pode_ver() or exists (
      select 1 from shift_logs l
      where l.id = statements.shift_log_id and l.rep_id = current_rep_id()
    )
  );

insert into reps (nome_curto, nome_oficial, turno, papel, cargo, role, valor_hora, ativo, observador) values
  ('Thomas', 'Thomas (OM)', 'T2T3', 'A', 'tertius', 'rep', 0, false, true);

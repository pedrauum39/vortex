-- Grand Primaris e Knight Primaris passam a administrar o time igual ao
-- role='admin' — tanto no banco (RLS, via is_admin()) quanto no app
-- (lib/auth.ts:ehAdmin()). Uma função só, usada por toda política de RLS
-- que já chamava is_admin(), então a mudança propaga sozinha pra
-- shifts/shift_logs/shift_log_models/statements/reps/models/storage etc.

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from reps
    where auth_user_id = auth.uid()
      and (role = 'admin' or cargo in ('grand_primaris', 'knight_primaris'))
  );
$$;

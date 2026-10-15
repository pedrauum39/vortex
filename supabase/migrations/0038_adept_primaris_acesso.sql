-- Adept Primaris administra o time igual ao Grand/Knight Primaris (is_admin,
-- pode_ver) e recebe 5,5% de comissão própria, a mesma taxa do Knight. O
-- party addition dele é só das páginas do Time 3 (lib/primarisDb.ts).

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from reps
    where auth_user_id = auth.uid()
      and (role = 'admin' or cargo in ('grand_primaris', 'knight_primaris', 'adept_primaris'))
  );
$$;

create or replace function public.pode_ver()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from reps
    where auth_user_id = auth.uid()
      and (role = 'admin' or cargo in ('grand_primaris', 'knight_primaris', 'adept_primaris') or observador or cargo = 'admin_5c')
  );
$$;

update commission_rules
set regra = jsonb_set(regra, '{percentual,adept_primaris}', '0.055')
where regra ? 'percentual';

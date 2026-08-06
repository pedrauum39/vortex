-- pode_ver() (leitura) passa a reconhecer o cargo admin_5c, igual já
-- reconhece observador — mesmo acesso de leitura do Thomas, sem entrar em
-- is_admin() (escrita continua travada só pra role='admin' e primaris de
-- verdade). Não mexe em nenhuma policy — elas já chamam pode_ver().

create or replace function public.pode_ver()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from reps
    where auth_user_id = auth.uid()
      and (role = 'admin' or cargo in ('grand_primaris', 'knight_primaris') or observador or cargo = 'admin_5c')
  );
$$;

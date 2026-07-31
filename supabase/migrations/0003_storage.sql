-- Bucket privado para os prints de statement.
-- Convenção de caminho: <rep_id>/<shift_log_id>.<ext>
-- A primeira pasta do caminho é o rep_id, e é isso que as políticas checam.

insert into storage.buckets (id, name, public)
values ('statements', 'statements', false)
on conflict (id) do nothing;

create policy statements_obj_select on storage.objects for select to authenticated
  using (
    bucket_id = 'statements'
    and (is_admin() or (storage.foldername(name))[1] = current_rep_id()::text)
  );

create policy statements_obj_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'statements'
    and (is_admin() or (storage.foldername(name))[1] = current_rep_id()::text)
  );

create policy statements_obj_update on storage.objects for update to authenticated
  using (
    bucket_id = 'statements'
    and (is_admin() or (storage.foldername(name))[1] = current_rep_id()::text)
  );

create policy statements_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'statements' and is_admin());

-- Foto de perfil do rep — mostrada na home (do próprio) e em /admin/reps
-- (todas). O admin envia por /admin/reps; a coluna guarda o caminho no
-- bucket.

alter table reps add column foto_path text;

-- Bucket público: a <img> carrega a foto direto pela URL, sem sessão. O
-- caminho tem o rep_id na primeira pasta e um uuid no arquivo, então a URL
-- não é adivinhável. Upload/remoção acontecem numa server action com
-- service role — o bucket público só serve pra leitura via <img>.
insert into storage.buckets (id, name, public)
values ('rep-fotos', 'rep-fotos', true)
on conflict (id) do nothing;

-- Defesa em profundidade: a escrita real usa service role e não passa por
-- RLS, mas sem policy a API do bucket fica trancada pra qualquer um — deixa
-- explícito que só admin mexe.
create policy rep_fotos_admin_write on storage.objects for all to authenticated
  using (bucket_id = 'rep-fotos' and is_admin())
  with check (bucket_id = 'rep-fotos' and is_admin());

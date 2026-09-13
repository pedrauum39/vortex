-- "Planejar turno": bloco de notas pessoal do rep pra preparar mass
-- messages/respostas antes do turno. Caixa de areia livre — não depende da
-- escala: o rep escolhe qualquer data + qualquer modelo ativa como aba.
--
-- Uma linha por (rep, data, modelo). `itens` é a lista ordenada de blocos
-- do editor (a ordem da lista JÁ é a ordem de exibição — reordenar é só
-- regravar o array): cada item é `{ id, tipo: 'texto', html }` (parágrafo
-- livre) ou `{ id, tipo: 'mass', texto, nota }` (o bloco numerado — texto
-- rico sanitizado no servidor antes de gravar, ver lib/sanitizarHtml.ts).
--
-- Só o próprio rep grava. Admin/primaris (is_admin()) só leem — servem pra
-- ajudar/revisar o script de alguém, nunca editam por cima.

create table planejamentos_turno (
  id            uuid primary key default gen_random_uuid(),
  rep_id        uuid not null references reps(id) on delete cascade,
  data          date not null,
  modelo_id     uuid not null references models(id) on delete cascade,
  itens         jsonb not null default '[]'::jsonb,
  atualizado_em timestamptz not null default now(),

  unique (rep_id, data, modelo_id)
);

create index planejamentos_turno_rep_idx on planejamentos_turno (rep_id);

alter table planejamentos_turno enable row level security;

create policy planejamentos_turno_select on planejamentos_turno for select to authenticated
  using (rep_id = current_rep_id() or is_admin());

create policy planejamentos_turno_insert on planejamentos_turno for insert to authenticated
  with check (rep_id = current_rep_id());

create policy planejamentos_turno_update on planejamentos_turno for update to authenticated
  using (rep_id = current_rep_id())
  with check (rep_id = current_rep_id());

create policy planejamentos_turno_delete on planejamentos_turno for delete to authenticated
  using (rep_id = current_rep_id());

revoke all on planejamentos_turno from anon;

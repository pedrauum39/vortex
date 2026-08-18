-- Tabela dedicada pro "Turno Extra" (docs/superpowers/specs/2026-08-18-
-- turno-extra-design.md) — nunca passa por shifts/shift_logs/statements,
-- de propósito: é ad-hoc (o rep digita dia/turno na hora, sem escala) e
-- pode ser sobre uma modelo sem cadastro nenhum (nome_livre).

create table turnos_extra (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references reps(id),
  data date not null,
  turno turno_t not null,
  model_id uuid references models(id),
  nome_livre text,
  net_assinaturas numeric not null default 0,
  net_gorjetas numeric not null default 0,
  net_publicacoes numeric not null default 0,
  net_mensagens numeric not null default 0,
  net_indicacoes numeric not null default 0,
  anterior jsonb,
  imagem_atual_path text,
  ocr_atual_raw jsonb,
  imagem_anterior_path text,
  ocr_anterior_raw jsonb,
  criado_em timestamptz not null default now(),
  constraint turnos_extra_modelo_check check (
    (model_id is not null and nome_livre is null) or (model_id is null and nome_livre is not null)
  )
);

alter table turnos_extra enable row level security;

create policy turnos_extra_select on turnos_extra for select to authenticated
  using (rep_id = current_rep_id() or pode_ver());

create policy turnos_extra_insert on turnos_extra for insert to authenticated
  with check (rep_id = current_rep_id() or is_admin());

create policy turnos_extra_delete on turnos_extra for delete to authenticated
  using (is_admin());

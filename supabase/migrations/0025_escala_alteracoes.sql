-- Log de auditoria das trocas de rep na grade da escala (/admin/turnos).
-- salvarGrade() → aplicarSlot() grava uma linha aqui toda vez que muda quem
-- ocupa um slot. Append-only: não tem policy de update nem delete de
-- propósito — histórico não se reescreve. rep_saiu nulo = o slot estava
-- vazio; rep_entrou nulo = o slot foi limpo pra "—".

create table escala_alteracoes (
  id           uuid primary key default gen_random_uuid(),
  data         date not null,
  turno        text not null check (turno in ('T2T3', 'T4T5', 'T6T1')),
  bloco        text not null check (bloco in ('I', 'II')),
  funcao       text not null check (funcao in ('regular', 'assist')),
  rep_saiu     uuid references reps(id) on delete set null,
  rep_entrou   uuid references reps(id) on delete set null,
  alterado_por uuid references reps(id) on delete set null,
  criado_em    timestamptz not null default now(),

  -- toda linha é uma mudança real: os dois lados diferentes e pelo menos um
  -- preenchido (aplicarSlot já só grava quando o rep_id do slot muda).
  constraint escala_alteracoes_mudanca_real check (
    rep_saiu is distinct from rep_entrou
    and (rep_saiu is not null or rep_entrou is not null)
  )
);

create index escala_alteracoes_data_idx on escala_alteracoes (data);

alter table escala_alteracoes enable row level security;

-- Quem já enxerga a aba admin enxerga o log (admin/primaris/observador/admin_5c).
create policy escala_alteracoes_select on escala_alteracoes for select to authenticated
  using (is_admin() or pode_ver());

-- Só admin grava. Sem update/delete — auditoria imutável.
create policy escala_alteracoes_insert on escala_alteracoes for insert to authenticated
  with check (is_admin());

revoke all on escala_alteracoes from anon;

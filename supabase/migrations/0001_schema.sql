-- Schema base do site do time Vortex.
-- Todos os timestamps são timestamptz (gravados em UTC).
-- A conversão para America/Sao_Paulo acontece na aplicação (lib/tempo.ts).

create type turno_t  as enum ('T2T3', 'T4T5', 'T6T1');
create type papel_t  as enum ('A', 'B', 'C');
create type role_t   as enum ('rep', 'admin');
create type bloco_t  as enum ('I', 'II');
create type funcao_t as enum ('regular', 'assist');
create type origem_t as enum ('gerado', 'manual');

-- ---------------------------------------------------------------- reps

create table reps (
  id           uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  nome_curto   text not null unique,
  nome_oficial text not null,
  turno        turno_t not null,
  papel        papel_t not null,
  role         role_t  not null default 'rep',
  valor_hora   numeric(10, 2) not null default 0,
  ativo        boolean not null default true,
  created_at   timestamptz not null default now()
);

-- Um único titular por (turno, papel) entre os reps ativos.
create unique index reps_turno_papel_ativo_idx
  on reps (turno, papel) where ativo;

-- ---------------------------------------------------------------- models

create table models (
  id   uuid primary key default gen_random_uuid(),
  nome text not null unique
);

-- ---------------------------------------------------------------- shifts

-- Uma linha por slot da escala. Linhas com origem = 'gerado' são produzidas
-- por gerarEscala(); linhas 'manual' são overrides do admin. O índice único
-- abaixo é o que garante a precedência: o gerador insere com ON CONFLICT DO
-- NOTHING, então nunca sobrescreve um override.
create table shifts (
  id        uuid primary key default gen_random_uuid(),
  data      date not null,
  turno     turno_t not null,
  bloco     bloco_t not null,
  rep_id    uuid references reps (id) on delete set null,
  model_id  uuid references models (id) on delete set null,
  funcao    funcao_t not null default 'regular',
  origem    origem_t not null default 'gerado',
  created_at timestamptz not null default now()
);

create unique index shifts_slot_idx on shifts (data, turno, bloco, funcao);
create index shifts_rep_data_idx on shifts (rep_id, data);

-- ---------------------------------------------------------------- shift_logs

create table shift_logs (
  id             uuid primary key default gen_random_uuid(),
  shift_id       uuid not null references shifts (id) on delete cascade,
  rep_id         uuid not null references reps (id) on delete cascade,
  clock_in_at    timestamptz not null default now(),
  clock_out_at   timestamptz,
  model_id_real  uuid references models (id) on delete set null,
  teve_assistente boolean not null default false,
  resumo         text,
  saiu_antes     boolean not null default false,
  motivo_saida   text,
  created_at     timestamptz not null default now(),

  constraint shift_logs_um_por_slot unique (shift_id, rep_id),
  constraint shift_logs_saida_ordenada check (
    clock_out_at is null or clock_out_at >= clock_in_at
  ),
  -- Motivo é obrigatório quando o rep marca que saiu antes da hora.
  constraint shift_logs_motivo_obrigatorio check (
    not saiu_antes or (motivo_saida is not null and length(btrim(motivo_saida)) > 0)
  )
);

create index shift_logs_rep_in_idx on shift_logs (rep_id, clock_in_at);

-- ---------------------------------------------------------------- statements

create table statements (
  id                    uuid primary key default gen_random_uuid(),
  shift_log_id          uuid not null references shift_logs (id) on delete cascade,
  imagem_path           text,
  ocr_raw               jsonb,
  valor_confirmado      numeric(12, 2),
  corrigido_manualmente boolean not null default false,
  created_at            timestamptz not null default now(),

  constraint statements_um_por_log unique (shift_log_id)
);

-- ---------------------------------------------------------------- commission_rules

-- Versionada: a regra vigente numa data é a de maior vigente_desde <= data.
-- O formato de `regra` é definido em lib/comissao.ts e editável pelo admin.
create table commission_rules (
  id             uuid primary key default gen_random_uuid(),
  vigente_desde  date not null unique,
  regra          jsonb not null,
  created_at     timestamptz not null default now()
);

-- Placeholder até o usuário informar as regras reais.
insert into commission_rules (vigente_desde, regra) values
  ('2026-01-01', '{"tipo": "percentual", "percentual": 0}');

insert into models (nome) values ('Vortex I'), ('Vortex II');

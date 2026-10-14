-- Leitura "filler": o print de uma modelo num turno em que ninguém do time
-- trabalhou ela (ex.: modelo nova que entrou no T2/T3 — o print do T6/T1
-- anterior existe, mas não é venda de ninguém). Só serve de base pra cadeia
-- de desconto: buscarAnterior() cai aqui quando o turno anterior não tem
-- statement dessa modelo. Nunca entra em comissão, meta ou bônus.
--
-- Substitui, na prática, o turno com "somar turno" desmarcado (conta_venda),
-- que só funcionava com o slot vazio — e o slot do turno anterior quase
-- sempre já tem o turno de verdade de outra modelo.

create table leituras_filler (
  id              uuid primary key default gen_random_uuid(),
  model_id        uuid not null references models(id) on delete cascade,
  data            date not null,
  turno           turno_t not null,
  net_assinaturas numeric(12, 2) not null default 0,
  net_gorjetas    numeric(12, 2) not null default 0,
  net_publicacoes numeric(12, 2) not null default 0,
  net_mensagens   numeric(12, 2) not null default 0,
  net_indicacoes  numeric(12, 2) not null default 0,
  criado_por      uuid references reps(id) on delete set null,
  criado_em       timestamptz not null default now(),
  unique (model_id, data, turno)
);

alter table leituras_filler enable row level security;

create policy leituras_filler_select on leituras_filler
  for select to authenticated using (pode_ver());

create policy leituras_filler_write on leituras_filler
  for all to authenticated using (is_admin()) with check (is_admin());

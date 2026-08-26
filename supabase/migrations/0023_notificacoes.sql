-- Sistema de notificações do admin pros reps
-- (docs/superpowers/specs/2026-08-26-notificacoes-design.md). Três tipos:
-- popup (modal, uma vez, sem prazo), aviso (banner com data_inicio/data_fim),
-- todo (banner sem prazo, "já fiz"). notificacao_destinatarios é
-- materializada por rep alvo no momento da criação — lida_em nula é
-- pendente, preenchida é confirmado. É o mesmo campo que alimenta tanto "o
-- que falta mostrar pro rep X" quanto "quem já confirmou" no admin.

create table notificacoes (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null check (tipo in ('popup', 'aviso', 'todo')),
  mensagem    text not null,
  data_inicio date,
  data_fim    date,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now(),

  -- data_inicio/data_fim só existem (e são obrigatórios) pra tipo=aviso.
  constraint notificacoes_periodo_so_aviso check (
    (tipo = 'aviso') = (data_inicio is not null and data_fim is not null)
  )
);

create table notificacao_destinatarios (
  notificacao_id uuid not null references notificacoes(id) on delete cascade,
  rep_id         uuid not null references reps(id) on delete cascade,
  lida_em        timestamptz,

  primary key (notificacao_id, rep_id)
);

alter table notificacoes enable row level security;

-- O rep precisa ler a PRÓPRIA notificação-alvo pra saber o texto e o tipo,
-- sem enxergar as dos outros. Admin/observador/admin_5c enxergam tudo
-- (pode_ver() já cobre os três, ver migrações 0014/0016).
create policy notificacoes_select on notificacoes for select to authenticated
  using (
    is_admin() or pode_ver() or exists (
      select 1 from notificacao_destinatarios d
      where d.notificacao_id = notificacoes.id and d.rep_id = current_rep_id()
    )
  );

create policy notificacoes_admin_write on notificacoes for all to authenticated
  using (is_admin()) with check (is_admin());

alter table notificacao_destinatarios enable row level security;

create policy notificacao_destinatarios_select on notificacao_destinatarios
  for select to authenticated
  using (is_admin() or pode_ver() or rep_id = current_rep_id());

-- Só admin cria/apaga destinatário (a lista de quem é alvo é decidida no
-- formulário do admin, nunca pelo próprio rep).
create policy notificacao_destinatarios_insert on notificacao_destinatarios
  for insert to authenticated with check (is_admin());

create policy notificacao_destinatarios_delete on notificacao_destinatarios
  for delete to authenticated using (is_admin());

-- O próprio rep precisa poder gravar a confirmação (lida_em) na própria
-- linha — "Fechar"/"Já vi"/"Já fiz" chamam essa mesma coluna.
create policy notificacao_destinatarios_update on notificacao_destinatarios
  for update to authenticated
  using (is_admin() or rep_id = current_rep_id())
  with check (is_admin() or rep_id = current_rep_id());

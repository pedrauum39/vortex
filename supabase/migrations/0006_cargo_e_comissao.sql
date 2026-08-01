-- Cargo define o percentual de comissão e é INDEPENDENTE do `papel`: papel é a
-- posição do rep no rodízio da escala (A/B/C), cargo é a patente dele.
-- Pedro Ribeiro, por exemplo, é papel A no T6/T1 e Grand Primaris.

create type cargo_t as enum ('grand_primaris', 'knight_primaris', 'secundus', 'tertius');

alter table reps add column cargo cargo_t not null default 'tertius';

-- Chute inicial a partir do papel, para o admin corrigir na tela: A vira
-- Knight Primaris, B vira Secundus, C vira Tertius.
update reps set cargo = case papel
  when 'A' then 'knight_primaris'::cargo_t
  when 'B' then 'secundus'::cargo_t
  else 'tertius'::cargo_t
end;

update reps set cargo = 'grand_primaris' where nome_curto = 'Pedro Ribeiro';

-- $2/hora para todo mundo. Fica na `reps` e não na regra para caber exceção
-- individual sem versionar a regra do time inteiro.
alter table reps alter column valor_hora set default 2;
update reps set valor_hora = 2;

-- Percentual por cargo e a fatia que o assistente leva da comissão do rep.
update commission_rules
set regra = jsonb_build_object(
  'percentual', jsonb_build_object(
    'grand_primaris',  0.06,
    'knight_primaris', 0.055,
    'secundus',        0.04,
    'tertius',         0.035
  ),
  'fatia_assistente', 0.10
)
where vigente_desde = '2026-01-01';

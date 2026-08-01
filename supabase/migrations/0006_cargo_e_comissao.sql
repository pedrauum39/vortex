-- Cargo define o percentual de comissão e é INDEPENDENTE do `papel`: papel é a
-- posição do rep no rodízio da escala (A/B/C), cargo é a patente dele.
--
-- Os valores vêm da tabela ADMIN TIME (coluna R) de `schedule by claude.xlsx`,
-- conferida nas 18 abas. Não dá para derivar do papel: Carolinne e Gabriela são
-- papel A e Secundus, enquanto Natasha é papel B e Primaris.

create type cargo_t as enum ('grand_primaris', 'knight_primaris', 'secundus', 'tertius');

alter table reps add column cargo cargo_t not null default 'tertius';

update reps set cargo = case nome_curto
  when 'Pedro Ribeiro'    then 'grand_primaris'::cargo_t   -- "Gran Primaris"
  when 'Natasha Tem Tem'  then 'knight_primaris'::cargo_t  -- "Primaris"
  when 'Carolinne P.'     then 'secundus'::cargo_t
  when 'Léo Grimaldi'     then 'secundus'::cargo_t
  when 'Gabriela Storini' then 'secundus'::cargo_t
  when 'Ignacio Canelo'   then 'secundus'::cargo_t
  when 'Oliver Melo'      then 'tertius'::cargo_t
  when 'Carlos de Lucca'  then 'tertius'::cargo_t
  when 'Diogo Ciesielski' then 'tertius'::cargo_t
  else cargo
end;

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

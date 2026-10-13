-- Reps provisórios do Time 3, só pra escala aparecer no site enquanto o
-- cadastro real não sai. Sem login (auth_user_id nulo) e valor_hora 0.
-- Trocar pelo cadastro real depois.

insert into reps (nome_curto, nome_oficial, turno, papel, cargo, role, valor_hora, ativo) values
  ('Secundus 3 T2T3', 'Secundus 3 T2T3', 'T2T3', 'D', 'secundus', 'rep', 0, true),
  ('Secundus 3 T4T5', 'Secundus 3 T4T5', 'T4T5', 'D', 'secundus', 'rep', 0, true),
  ('Secundus 3 T6T1', 'Secundus 3 T6T1', 'T6T1', 'D', 'secundus', 'rep', 0, true),
  ('Tertius 2 T2T3',  'Tertius 2 T2T3',  'T2T3', 'E', 'tertius',  'rep', 0, true),
  ('Tertius 2 T4T5',  'Tertius 2 T4T5',  'T4T5', 'E', 'tertius',  'rep', 0, true),
  ('Tertius 2 T6T1',  'Tertius 2 T6T1',  'T6T1', 'E', 'tertius',  'rep', 0, true);

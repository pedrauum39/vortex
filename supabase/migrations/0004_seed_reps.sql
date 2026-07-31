-- Os 9 reps do time, com turno e papel conforme a tabela de project.md.
-- `auth_user_id` fica null até o admin vincular o login de cada um.
-- `valor_hora` fica 0 até o usuário informar os valores reais.

insert into reps (nome_curto, nome_oficial, turno, papel) values
  ('Carolinne P.',      'Carolinne Pacheco Campos',        'T2T3', 'A'),
  ('Léo Grimaldi',      'Léo Victor Grimaldi de Castro',   'T2T3', 'B'),
  ('Oliver Melo',       'Oliver Barroso Melo',             'T2T3', 'C'),
  ('Gabriela Storini',  'Gabriela Jacó Storini',           'T4T5', 'A'),
  ('Ignacio Canelo',    'Ignacio Canelo',                  'T4T5', 'B'),
  ('Carlos de Lucca',   'Carlos Antônio de Lucca Vicente', 'T4T5', 'C'),
  ('Pedro Ribeiro',     'Pedro Ribeiro da Silva Neto',     'T6T1', 'A'),
  ('Natasha Tem Tem',   'Natasha Tem Tem',                 'T6T1', 'B'),
  ('Diogo Ciesielski',  'Diogo Ciesielski',                'T6T1', 'C')
on conflict (nome_curto) do nothing;

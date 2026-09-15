-- Deixa marcar um turno como "não soma venda" — usado pra lançar um turno
-- que só serve de leitura anterior pra cadeia de desconto (ex.: modelo nova
-- que entrou no meio do dia, sem T6/T1 registrado antes dela), sem inflar
-- meta da página nem bônus de Party/Team addition dos primaris. Default
-- true: turno normal sempre contou e continua contando, sem mudar nada.
alter table shifts add column conta_venda boolean not null default true;

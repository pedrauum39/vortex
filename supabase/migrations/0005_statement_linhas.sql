-- O statement é acumulado no dia e a comissão não incide sobre todas as linhas,
-- então guardar um único valor não basta: precisamos da quebra por categoria
-- para descontar o turno anterior linha a linha.
--
-- Os valores gravados são os NET ACUMULADOS que o rep confirmou, exatamente
-- como aparecem no print. O quanto ele fez no próprio turno é calculado na
-- leitura (lib/statement.ts), não materializado.

alter table statements rename column valor_confirmado to net_total;

alter table statements
  add column net_assinaturas numeric(12, 2) not null default 0,
  add column net_gorjetas    numeric(12, 2) not null default 0,
  add column net_publicacoes numeric(12, 2) not null default 0,
  add column net_mensagens   numeric(12, 2) not null default 0,
  add column net_indicacoes  numeric(12, 2) not null default 0,
  -- O rep marcou "Houve" quando uma linha veio menor que a do turno anterior:
  -- num acumulado isso só se explica por estorno na plataforma.
  add column refund_confirmado boolean not null default false;

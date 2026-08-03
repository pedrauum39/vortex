-- A abordagem da 0011 (cover_cargo amarrado a um rep de verdade) resolvia o
-- problema errado: o cover é usado justamente quando NINGUÉM do time pode
-- fazer o turno, então não tem rep pra escolher — e o pagamento dele nem
-- precisa ser calculado, só a parte que conta pro bônus de Party/Team
-- addition dos primaris. Reverte a coluna e troca por 3 reps sintéticos, que
-- aparecem no mesmo seletor de reps de sempre (a query de reps nunca
-- filtrou por ativo) sem precisar de nenhuma coluna nova nem de lógica
-- extra em invoiceDb/primarisDb — reps.cargo já é o suficiente.

alter table shifts drop column cover_cargo;

insert into reps (nome_curto, nome_oficial, turno, papel, cargo, role, valor_hora, ativo) values
  ('Cover Tertius',  'Cover Tertius',  'T2T3', 'C', 'tertius',         'rep', 0, false),
  ('Cover Secundus', 'Cover Secundus', 'T2T3', 'C', 'secundus',        'rep', 0, false),
  ('Cover Primaris', 'Cover Primaris', 'T2T3', 'C', 'knight_primaris', 'rep', 0, false);

comment on table reps is
  'Inclui 3 linhas sintéticas "Cover Tertius/Secundus/Primaris" (ativo=false, valor_hora=0) — placeholder pra quando ninguém do time pode cobrir um turno; entram no seletor de reps normalmente, mas não logam nem contam como funcionário de verdade (telas que filtram ativo=true, como /admin/reps e o "porRep" de /primaris, já as escondem).';

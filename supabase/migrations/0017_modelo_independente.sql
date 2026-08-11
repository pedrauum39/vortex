-- Kaylin quebrava início/fechamento de turno: ninguém do time trabalha ela
-- toda vez, então a cadeia de desconto (buscarAnterior) ficava sempre
-- "pendente" (o turno imediatamente anterior nunca tem o statement dela) —
-- um rep que a marcasse ficava travado sem conseguir fechar o próprio turno,
-- o que por sua vez travava ele de iniciar o próximo (o app sempre prioriza
-- mostrar o turno em aberto antes de deixar abrir um novo).
--
-- models.independente: true = cada turno dela conta o print inteiro, sem
-- procurar/descontar o turno anterior — vira sempre "primeiro" na cadeia.

alter table models add column independente boolean not null default false;

update models set independente = true where nome = 'Kaylin';

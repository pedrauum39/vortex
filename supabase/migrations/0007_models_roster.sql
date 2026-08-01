-- 'Vortex I' / 'Vortex II' eram, na verdade, nomes de TIME — o rótulo já é
-- fixo na tela (Time 1 / Time 2), independente do que está aqui. `models`
-- vira o roster de verdade: cada modelo (perfil de conteúdo) pertence a um
-- dos dois times, e o time pode ter várias modelos.

alter table models
  add column bloco bloco_t not null default 'I',
  add column ativa boolean not null default true;

update models set bloco = 'I' where nome = 'Vortex I';
update models set bloco = 'II' where nome = 'Vortex II';

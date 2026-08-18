-- Redesenho do "turno independente"/"página externa" como "Turno Extra"
-- (docs/superpowers/specs/2026-08-18-turno-extra-design.md). A lógica de
-- pular a cadeia automática sai do fluxo normal de clock-in/out e vai pra
-- uma tabela própria (turnos_extra, migração seguinte) — estas colunas
-- ficam mortas.

alter table models rename column independente to extra;
alter table models drop column externa;
alter table statements drop column anterior_manual;

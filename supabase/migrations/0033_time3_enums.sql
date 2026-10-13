-- Time 3 (Vortex III). Valor novo de enum não pode ser usado na mesma
-- migração que o cria, então os reps do Time 3 entram na 0034.
--   bloco III = o Vortex III
--   papel D   = titular do Vortex III no turno
--   papel E   = 2º tertius do turno (cobre a folga do D)
-- Ver FOLGA/INICIO_TIME3 em lib/escala.ts.

alter type bloco_t add value if not exists 'III';
alter type papel_t add value if not exists 'D';
alter type papel_t add value if not exists 'E';

alter table escala_alteracoes drop constraint escala_alteracoes_bloco_check;
alter table escala_alteracoes add constraint escala_alteracoes_bloco_check
  check (bloco in ('I', 'II', 'III'));

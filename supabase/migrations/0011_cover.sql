-- "Cover": quando alguém de fora do slot cobre o turno, o admin marca em qual
-- nível de comissão isso paga (Tertius 3,5% / Secundus 4% / Primaris 5,5% —
-- taxa do Knight Primaris), em vez do cargo real de quem cobriu. O resto do
-- cálculo (horas, base do turno, fatia do assistente) não muda.

alter table shifts add column cover_cargo cargo_t;

comment on column shifts.cover_cargo is
  'Quando setado, a comissão deste turno usa este cargo em vez do cargo real do rep_id — é um cover de outro time/nível, não a escala normal dele.';

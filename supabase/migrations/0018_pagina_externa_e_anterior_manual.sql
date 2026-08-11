-- Duas peças do "turno independente" completo (Kaylin já usa a parte da
-- 0017; isto completa o fluxo de upload manual + o caso de página fora do
-- roster, tipo "Kylie"):
--
-- statements.anterior_manual: as 5 linhas net do turno anterior, digitadas
-- ou lidas por OCR na hora, quando a modelo é independente e o turno é
-- T2T3/T4T5 (T6T1 continua sempre 'primeiro', sem pedir nada — ver 0017).
-- Só vale pra ESSE statement, nunca vira elo permanente da cadeia.
--
-- models.externa: página que não pertence a nenhum dos dois times (ex.:
-- "Kylie") — conta só o invoice pessoal de quem trabalhou nela (base normal
-- x % do cargo), nunca meta nem bônus de Party/Team addition dos primaris.

alter table statements add column anterior_manual jsonb;

alter table models add column externa boolean not null default false;

-- A 0021 deu período aberto (fim null) pra TODA modelo no backfill, incluindo
-- as que já estavam ativa=false antes dessa feature existir (ex.: Issy Black,
-- Kaylin). Período nunca fechando significa metaProrateada (que não filtra
-- por ativa de propósito, pra dar crédito parcial em desativação no meio do
-- mês) segue dando a meta_mensal cheia pra elas todo mês, pra sempre.
--
-- Fecha "a partir de hoje": não sabemos a data real de desativação de cada
-- uma, então fechar hoje para a inflação sem inventar uma data histórica que
-- distorceria relatórios de meses já fechados.
update model_bloco_periodos
set fim = current_date
where fim is null
  and model_id in (select id from models where ativa = false);

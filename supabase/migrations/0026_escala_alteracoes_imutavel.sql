-- 0025 apoiou a imutabilidade de escala_alteracoes só na ausência de policy de
-- update/delete — isso trava UPDATE/DELETE via RLS, mas o Supabase concede
-- UPDATE/DELETE/TRUNCATE de graça pro role `authenticated`, e TRUNCATE não
-- passa por RLS (é privilégio puro). Mesmo cuidado do 0023_notificacoes.sql.
revoke update, delete, truncate on escala_alteracoes from authenticated;

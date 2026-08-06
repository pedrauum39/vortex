-- Admin 5C é um cargo (igual Grand/Knight Primaris), não uma pessoa fixa —
-- qualquer rep com esse cargo ganha acesso de leitura (schedule/admin/
-- primaris) sem editar nada, mesmo nível do observador (Thomas). Precisa de
-- migração própria: Postgres não deixa usar um valor novo de enum na mesma
-- transação em que ele foi adicionado, então pode_ver() (0016) fica separado.

alter type cargo_t add value 'admin_5c';

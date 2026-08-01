-- `shifts.model_id` era "o modelo planejado do bloco", preenchido pelo
-- gerador de escala mapeando bloco -> 'Vortex I'/'Vortex II' por NOME. Isso
-- morreu quando os modelos viraram roster (migração 0007): 'Vortex I' e
-- 'Vortex II' eram nomes de TIME, não de modelo, e foram renomeados — o
-- gerador não acha mais o nome e passou a gravar tudo com model_id nulo.
--
-- Mais que isso, o conceito não faz mais sentido: um time agora pode ter
-- várias modelos no roster, e não tem como o gerador saber sozinho qual delas
-- é "a" modelo do dia. Quem sabe é o clock-in — é lá que o rep escolhe.
--
-- A view passa a mostrar a modelo REALMENTE trabalhada (via shift_log_models),
-- não mais uma planejada que ninguém mantém.

drop view escala_time;

create view escala_time
with (security_invoker = false) as
select
  s.data,
  s.turno,
  s.bloco,
  s.funcao,
  s.origem,
  r.nome_curto as rep_nome,
  (
    select string_agg(m.nome, ' + ' order by m.nome)
    from shift_logs sl
    join shift_log_models slm on slm.shift_log_id = sl.id
    join models m on m.id = slm.model_id
    where sl.shift_id = s.id
  ) as modelos_nome
from shifts s
left join reps r on r.id = s.rep_id;

revoke all on escala_time from anon, authenticated;
grant select on escala_time to authenticated;

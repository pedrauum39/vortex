-- Turno dividido: quando alguém sai no meio do turno e outro assume, o admin
-- divide o slot em duas metades de 4h (T6|T1, T2|T3, T4|T5), cada uma com o
-- próprio regular, assistente, ponto e print. 0 = turno inteiro (o normal).
-- Ver lib/turno.ts (janelaDoTurno) e lib/statementDb.ts (buscarAnterior).

alter table shifts
  add column metade smallint not null default 0 check (metade in (0, 1, 2));

drop index shifts_slot_idx;
create unique index shifts_slot_idx on shifts (data, turno, bloco, funcao, metade);

alter table escala_alteracoes
  add column metade smallint not null default 0 check (metade in (0, 1, 2));

create or replace view escala_time with (security_invoker = false) as
 SELECT s.data,
    s.turno,
    s.bloco,
    s.funcao,
    s.origem,
    r.nome_curto AS rep_nome,
    ( SELECT string_agg(m.nome, ' + '::text ORDER BY m.nome) AS string_agg
           FROM shift_logs sl
             JOIN shift_log_models slm ON slm.shift_log_id = sl.id
             JOIN models m ON m.id = slm.model_id
          WHERE sl.shift_id = s.id) AS modelos_nome,
    s.metade
   FROM shifts s
     LEFT JOIN reps r ON r.id = s.rep_id;

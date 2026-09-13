-- "Planejar turno" simplificado: só existem blocos "mass" (itens) e uma
-- área de texto livre por aba (data+modelo) — o parágrafo solto virou um
-- campo único de bloco de notas, não mais um item arrastável separado.

alter table planejamentos_turno add column texto_livre text not null default '';

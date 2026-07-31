import type { SupabaseClient } from '@supabase/supabase-js';
import { gerarEscala, type SlotEscala } from './escala';
import type { Bloco, Funcao, Model, Origem, Rep, Turno } from './tipos';

export type LinhaShift = {
  data: string;
  turno: Turno;
  bloco: Bloco;
  funcao: Funcao;
  rep_id: string;
  model_id: string | null;
  origem: Origem;
};

/** Bloco de cima é a Vortex I, bloco de baixo é a Vortex II. Ver project.md. */
const MODELO_DO_BLOCO: Record<Bloco, string> = { I: 'Vortex I', II: 'Vortex II' };

/** Resolve papel+turno em rep_id e bloco em model_id. Função pura. */
export function slotsParaLinhas(
  slots: SlotEscala[],
  reps: Rep[],
  models: Model[],
): LinhaShift[] {
  const porPapel = new Map(reps.map((r) => [`${r.turno}|${r.papel}`, r.id]));
  const porNome = new Map(models.map((m) => [m.nome, m.id]));

  return slots.flatMap((slot) => {
    const rep_id = porPapel.get(`${slot.turno}|${slot.papel}`);
    if (!rep_id) return [];

    return [
      {
        data: slot.data,
        turno: slot.turno,
        bloco: slot.bloco,
        funcao: slot.funcao,
        rep_id,
        model_id: porNome.get(MODELO_DO_BLOCO[slot.bloco]) ?? null,
        origem: slot.origem,
      },
    ];
  });
}

/**
 * Materializa a escala gerada no período. `ignoreDuplicates` faz o insert bater
 * no índice único de shifts e não fazer nada — é o que garante que o gerador
 * nunca sobrescreve um override manual.
 *
 * Recebe o cliente pronto: quem chama já verificou que é admin.
 */
export async function materializarEscala(
  supabase: SupabaseClient,
  dataInicio: string,
  dataFim: string,
) {
  const { data: reps } = await supabase.from('reps').select('*');
  const { data: models } = await supabase.from('models').select('*');

  const linhas = slotsParaLinhas(
    gerarEscala(dataInicio, dataFim),
    (reps ?? []) as Rep[],
    (models ?? []) as Model[],
  );

  const { error } = await supabase
    .from('shifts')
    .upsert(linhas, { onConflict: 'data,turno,bloco,funcao', ignoreDuplicates: true });

  if (error) throw error;
  return linhas.length;
}

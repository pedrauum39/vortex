import type { SupabaseClient } from '@supabase/supabase-js';
import { gerarEscala, type SlotEscala } from './escala';
import type { Bloco, Funcao, Origem, Rep, Turno } from './tipos';

export type LinhaShift = {
  data: string;
  turno: Turno;
  bloco: Bloco;
  funcao: Funcao;
  rep_id: string;
  origem: Origem;
};

// Não tem mais "o modelo do bloco": um time pode ter várias modelos no
// roster, e não tem como o gerador saber sozinho qual delas é a do dia — quem
// escolhe é o rep, no clock-in (ver shift_log_models). shifts.model_id fica
// sem uso aqui de propósito.

/** Resolve papel+turno em rep_id. Função pura. */
export function slotsParaLinhas(slots: SlotEscala[], reps: Rep[]): LinhaShift[] {
  const porPapel = new Map(reps.map((r) => [`${r.turno}|${r.papel}`, r.id]));

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

  const linhas = slotsParaLinhas(gerarEscala(dataInicio, dataFim), (reps ?? []) as Rep[]);

  const { error } = await supabase
    .from('shifts')
    .upsert(linhas, { onConflict: 'data,turno,bloco,funcao', ignoreDuplicates: true });

  if (error) throw error;
  return linhas.length;
}

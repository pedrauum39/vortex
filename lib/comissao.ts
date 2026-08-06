// Cálculo do que cada um recebe por turno.
//
// Duas parcelas: horas x valor/hora, e comissão sobre a base do turno (que é o
// net do turno sem assinaturas e sem indicações — ver lib/statement.ts).
//
// O assistente não tem comissão própria: ele leva uma fatia da comissão do rep
// que assistiu, e essa fatia SAI da comissão do rep. O total pago pelo slot é
// o mesmo com ou sem assistente — muda só quem fica com o quê.

import type { Cargo } from './tipos';

// O valor/hora NÃO mora aqui: ele é do rep (`reps.valor_hora`), para caber
// exceção individual sem versionar a regra do time inteiro.
export type RegraComissao = {
  percentual: Record<Cargo, number>;
  /** Fatia da comissão do rep que vai para o assistente. */
  fatia_assistente: number;
};

export const REGRA_PADRAO: RegraComissao = {
  percentual: {
    grand_primaris: 0.06,
    knight_primaris: 0.055,
    secundus: 0.04,
    tertius: 0.035,
    // Cargo de acesso (Admin 5C), não trabalha turno — nunca entra na base de comissão.
    admin_5c: 0,
  },
  fatia_assistente: 0.1,
};

const centavos = (valor: number) => Math.round(valor * 100) / 100;

export type Pagamento = {
  horas: number;
  comissao: number;
  total: number;
};

export function pagamentoDoSlot(
  regular: { horas: number; base: number; cargo: Cargo; valorHora: number },
  assistente: { horas: number; valorHora: number } | null,
  regra: RegraComissao,
): {
  regular: Pagamento & { repassado: number };
  assistente: Pagamento | null;
} {
  const bruta = centavos(regular.base * regra.percentual[regular.cargo]);
  const repassado = assistente ? centavos(bruta * regra.fatia_assistente) : 0;

  const comissaoRegular = centavos(bruta - repassado);
  const horasRegular = centavos(regular.horas * regular.valorHora);

  return {
    regular: {
      horas: horasRegular,
      comissao: comissaoRegular,
      repassado,
      total: centavos(horasRegular + comissaoRegular),
    },
    assistente: assistente
      ? {
          horas: centavos(assistente.horas * assistente.valorHora),
          comissao: repassado,
          total: centavos(assistente.horas * assistente.valorHora + repassado),
        }
      : null,
  };
}

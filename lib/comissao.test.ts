import { describe, expect, test } from 'vitest';
import { REGRA_PADRAO, pagamentoDoSlot } from './comissao';

describe('pagamentoDoSlot', () => {
  test('o exemplo do Pedro: GP com $100 de base e assistente', () => {
    const { regular, assistente } = pagamentoDoSlot(
      { horas: 8, base: 100, cargo: 'grand_primaris', valorHora: 2 },
      { horas: 8, valorHora: 2 },
      REGRA_PADRAO,
    );

    // 6% de 100 = 6,00. O assistente leva 10% disso, saindo da comissão do GP.
    expect(regular.comissao).toBe(5.4);
    expect(regular.repassado).toBe(0.6);
    expect(assistente!.comissao).toBe(0.6);

    // 8h x $2 para cada um.
    expect(regular.horas).toBe(16);
    expect(assistente!.horas).toBe(16);

    expect(regular.total).toBe(21.4);
    expect(assistente!.total).toBe(16.6);
  });

  test('sem assistente o rep fica com a comissão inteira', () => {
    const { regular, assistente } = pagamentoDoSlot(
      { horas: 8, base: 100, cargo: 'grand_primaris', valorHora: 2 },
      null,
      REGRA_PADRAO,
    );

    expect(regular.comissao).toBe(6);
    expect(regular.repassado).toBe(0);
    expect(regular.total).toBe(22);
    expect(assistente).toBeNull();
  });

  test('o percentual muda com o cargo', () => {
    const base = { horas: 0, base: 1000 };
    const so = (cargo: Parameters<typeof pagamentoDoSlot>[0]['cargo']) =>
      pagamentoDoSlot({ ...base, cargo, valorHora: 2 }, null, REGRA_PADRAO).regular.comissao;

    expect(so('grand_primaris')).toBe(60);
    expect(so('knight_primaris')).toBe(55);
    expect(so('secundus')).toBe(40);
    expect(so('tertius')).toBe(35);
  });

  test('o que sai do rep é exatamente o que entra no assistente', () => {
    const { regular, assistente } = pagamentoDoSlot(
      { horas: 8, base: 2266.46, cargo: 'secundus', valorHora: 2 },
      { horas: 8, valorHora: 2 },
      REGRA_PADRAO,
    );

    expect(regular.repassado).toBe(assistente!.comissao);
    expect(regular.comissao + regular.repassado).toBe(
      pagamentoDoSlot({ horas: 8, base: 2266.46, cargo: 'secundus', valorHora: 2 }, null, REGRA_PADRAO).regular
        .comissao,
    );
  });

  test('o assistente não ganha comissão sobre venda própria — só a fatia', () => {
    const { assistente } = pagamentoDoSlot(
      { horas: 8, base: 5000, cargo: 'tertius', valorHora: 2 },
      { horas: 4, valorHora: 2 },
      REGRA_PADRAO,
    );

    // 3,5% de 5000 = 175; 10% disso = 17,50. Mais 4h x $2.
    expect(assistente!.comissao).toBe(17.5);
    expect(assistente!.horas).toBe(8);
    expect(assistente!.total).toBe(25.5);
  });

  test('turno sem venda paga só as horas', () => {
    const { regular } = pagamentoDoSlot(
      { horas: 7.25, base: 0, cargo: 'knight_primaris', valorHora: 2 },
      null,
      REGRA_PADRAO,
    );

    expect(regular.comissao).toBe(0);
    expect(regular.total).toBe(14.5);
  });

  test('arredonda em centavos', () => {
    const { regular } = pagamentoDoSlot(
      { horas: 8, base: 1786.77, cargo: 'grand_primaris', valorHora: 2 },
      null,
      REGRA_PADRAO,
    );

    // 6% de 1786,77 = 107,2062
    expect(regular.comissao).toBe(107.21);
    expect(regular.total).toBe(123.21);
  });
});

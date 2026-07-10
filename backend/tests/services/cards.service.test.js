jest.mock('../../src/config/prisma', () => require('../helpers/prismaMock').createPrismaMock());

const prismaMock = require('../../src/config/prisma');
const { installDefaults } = require('../helpers/prismaMock');
const { listCards, computeUsedLimitsByCard, createCard, deactivateCard } = require('../../src/modules/cards/cards.service');

beforeEach(() => installDefaults(prismaMock));

describe('computeUsedLimitsByCard — fix de N+1 (1 query em vez de 1-por-cartão)', () => {
  test('soma corretamente por cartão a partir de uma lista única de despesas', async () => {
    prismaMock.expense.findMany.mockResolvedValue([
      { value: 100, cardInvoice: { cardId: 1n } },
      { value: 50, cardInvoice: { cardId: 1n } },
      { value: 200, cardInvoice: { cardId: 2n } },
    ]);

    const result = await computeUsedLimitsByCard([1n, 2n, 3n]);

    expect(result.get('1')).toBe(150);
    expect(result.get('2')).toBe(200);
    expect(result.get('3')).toBeUndefined(); // cartão 3 sem despesas -> sem entrada no Map
    expect(prismaMock.expense.findMany).toHaveBeenCalledTimes(1);
  });

  test('lista vazia de cartões não faz nenhuma query (evita WHERE IN () vazio)', async () => {
    const result = await computeUsedLimitsByCard([]);

    expect(result.size).toBe(0);
    expect(prismaMock.expense.findMany).not.toHaveBeenCalled();
  });
});

describe('listCards — usa 2 queries no total, não importa quantos cartões', () => {
  test('retorna usedLimit/availableLimit corretos para cada cartão, com 1 findMany de cartões + 1 de despesas', async () => {
    prismaMock.card.findMany.mockResolvedValue([
      { id: 1n, limitValue: 1000, name: 'Nubank' },
      { id: 2n, limitValue: 500, name: 'Inter' },
    ]);
    prismaMock.expense.findMany.mockResolvedValue([
      { value: 300, cardInvoice: { cardId: 1n } },
      { value: 600, cardInvoice: { cardId: 2n } }, // > limite -> availableLimit deve ficar em 0, não negativo
    ]);

    const result = await listCards(10n);

    expect(result[0]).toMatchObject({ usedLimit: 300, availableLimit: 700 });
    expect(result[1]).toMatchObject({ usedLimit: 600, availableLimit: 0 });
    expect(prismaMock.card.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.expense.findMany).toHaveBeenCalledTimes(1);
  });

  test('usuário sem cartões: retorna lista vazia sem consultar despesas', async () => {
    prismaMock.card.findMany.mockResolvedValue([]);

    const result = await listCards(10n);

    expect(result).toEqual([]);
    expect(prismaMock.expense.findMany).not.toHaveBeenCalled();
  });
});

describe('cards.service — AuditLog', () => {
  test('createCard grava audit log de create', async () => {
    prismaMock.card.create.mockResolvedValue({ id: 9n, userId: 10n, name: 'Nubank' });

    await createCard(10n, { name: 'Nubank', limitValue: 1000, closingDay: 20, dueDay: 5 });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ entity: 'card', entityId: 9n, action: 'create' }) })
    );
  });

  test('deactivateCard grava audit log de deactivate com valor antigo (active:true) e novo (active:false)', async () => {
    prismaMock.card.findFirst.mockResolvedValue({ id: 9n, userId: 10n, active: true });
    prismaMock.card.update.mockResolvedValue({ id: 9n, active: false });

    await deactivateCard(10n, 9n);

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entity: 'card', entityId: 9n, action: 'deactivate',
          oldValueJson: expect.objectContaining({ active: true }),
          newValueJson: expect.objectContaining({ active: false }),
        }),
      })
    );
  });
});

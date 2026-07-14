jest.mock('../../src/config/prisma', () => require('../helpers/prismaMock').createPrismaMock());

const prismaMock = require('../../src/config/prisma');
const { installDefaults } = require('../helpers/prismaMock');
const { search } = require('../../src/modules/search/search.service');

beforeEach(() => {
  installDefaults(prismaMock);
  prismaMock.expense.findMany.mockResolvedValue([]);
  prismaMock.income.findMany.mockResolvedValue([]);
  prismaMock.debt.findMany.mockResolvedValue([]);
  prismaMock.card.findMany.mockResolvedValue([]);
  prismaMock.goal.findMany.mockResolvedValue([]);
});

describe('search — validação básica', () => {
  test('termo com menos de 2 caracteres devolve lista vazia sem consultar o banco', async () => {
    const result = await search(10n, 'a');
    expect(result.results).toEqual([]);
    expect(prismaMock.expense.findMany).not.toHaveBeenCalled();
  });

  test('string vazia ou undefined também devolve vazio, sem quebrar', async () => {
    expect((await search(10n, '')).results).toEqual([]);
    expect((await search(10n, undefined)).results).toEqual([]);
  });
});

describe('search — resultados por tipo', () => {
  test('encontra despesa e devolve rota/aba corretas por tipo (fixed -> aba fixed)', async () => {
    prismaMock.expense.findMany.mockResolvedValue([
      { id: 1n, description: 'Netflix', value: 39.9, monthId: 5n, type: 'fixed', month: { month: 7, year: 2026 } },
    ]);

    const { results } = await search(10n, 'netflix');

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ type: 'expense', label: 'Netflix', route: '/expenses', tab: 'fixed' });
  });

  test('encontra dívida e sempre aponta para a aba priority', async () => {
    prismaMock.debt.findMany.mockResolvedValue([
      { id: 2n, description: 'Financiamento carro', remainingBalance: 15000, status: 'active' },
    ]);

    const { results } = await search(10n, 'carro');

    expect(results[0]).toMatchObject({ type: 'debt', route: '/expenses', tab: 'priority' });
    expect(results[0].subtitle).toMatch(/ativa/);
  });

  test('encontra cartão e meta simultaneamente quando o termo bate em ambos', async () => {
    prismaMock.card.findMany.mockResolvedValue([{ id: 3n, name: 'Nubank Viagem', limitValue: 5000 }]);
    prismaMock.goal.findMany.mockResolvedValue([{ id: 4n, name: 'Viagem Japão', targetValue: 20000 }]);

    const { results } = await search(10n, 'viagem');

    expect(results.map((r) => r.type).sort()).toEqual(['card', 'goal']);
  });

  test('todas as buscas são sempre escopadas por userId (nunca vaza dado de outro usuário)', async () => {
    await search(42n, 'qualquer coisa');

    for (const model of [prismaMock.expense, prismaMock.income, prismaMock.debt, prismaMock.card, prismaMock.goal]) {
      const [{ where }] = model.findMany.mock.calls[0];
      expect(where.userId).toBe(42n);
    }
  });
});

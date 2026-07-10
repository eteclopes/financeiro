jest.mock('../../src/config/prisma', () => require('../helpers/prismaMock').createPrismaMock());
jest.mock('../../src/modules/months/months.service');
jest.mock('../../src/modules/expenses/expenses.service');

const prismaMock = require('../../src/config/prisma');
const { installDefaults } = require('../helpers/prismaMock');
const monthsService = require('../../src/modules/months/months.service');
const expensesService = require('../../src/modules/expenses/expenses.service');
const { createDebt, updateDebt, deleteDebt } = require('../../src/modules/debts/debts.service');

beforeEach(() => {
  installDefaults(prismaMock);
  monthsService.getMonthOrThrow.mockResolvedValue({ id: 1n, userId: 10n, status: 'open' });
  monthsService.assertMonthIsOpen.mockImplementation(() => {});
  expensesService.assertCategoryIsValid.mockResolvedValue(undefined);
  expensesService.dueDateFromDay.mockReturnValue(new Date());
});

describe('debts.service — AuditLog', () => {
  test('createDebt grava audit log de create depois do commit', async () => {
    prismaMock.debt.create.mockResolvedValue({ id: 5n, userId: 10n, totalValue: 300 });
    prismaMock.expense.create.mockResolvedValue({ id: 1n });

    await createDebt(10n, { monthId: 1n, categoryId: 1n, description: 'Financiamento', totalValue: 300, installmentsCount: 3, flexiblePayment: false, dueDay: 10 });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 10n, entity: 'debt', entityId: 5n, action: 'create' }) })
    );
  });

  test('updateDebt grava audit log de update com valor antigo e novo', async () => {
    prismaMock.debt.findFirst.mockResolvedValue({ id: 5n, userId: 10n, description: 'Antiga' });
    prismaMock.debt.update.mockResolvedValue({ id: 5n, description: 'Nova' });
    prismaMock.expense.findMany.mockResolvedValue([]);

    await updateDebt(10n, 5n, { description: 'Nova' });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entity: 'debt', entityId: 5n, action: 'update',
          oldValueJson: expect.objectContaining({ description: 'Antiga' }),
          newValueJson: expect.objectContaining({ description: 'Nova' }),
        }),
      })
    );
  });

  test('deleteDebt (soft delete) grava audit log de delete', async () => {
    prismaMock.debt.findFirst.mockResolvedValue({ id: 5n, userId: 10n, status: 'active' });
    prismaMock.debt.update.mockResolvedValue({ id: 5n, status: 'settled' });
    prismaMock.expense.deleteMany.mockResolvedValue({ count: 1 });

    await deleteDebt(10n, 5n);

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ entity: 'debt', entityId: 5n, action: 'delete' }) })
    );
  });

  test('dívida de outro usuário (404) não grava audit log nenhum', async () => {
    prismaMock.debt.findFirst.mockResolvedValue(null);

    await expect(updateDebt(10n, 999n, { description: 'x' })).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });
});

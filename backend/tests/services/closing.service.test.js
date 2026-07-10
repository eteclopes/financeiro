jest.mock('../../src/config/prisma', () => require('../helpers/prismaMock').createPrismaMock());
jest.mock('../../src/modules/months/months.service');
jest.mock('../../src/modules/expenses/expenses.service');
jest.mock('../../src/modules/debts/debts.service');

const prismaMock = require('../../src/config/prisma');
const { installDefaults } = require('../helpers/prismaMock');
const monthsService = require('../../src/modules/months/months.service');
const { closeMonth } = require('../../src/modules/closing/closing.service');

beforeEach(() => {
  installDefaults(prismaMock);
  prismaMock.$queryRaw.mockResolvedValue([{ id: 3n, status: 'open', month: 6, year: 2026 }]);
  monthsService.getOrCreateMonth.mockResolvedValue({ id: 4n, month: 7, year: 2026 });
});

describe('closeMonth — AuditLog', () => {
  test('fechamento bem-sucedido grava audit log de close, depois do commit', async () => {
    const result = await closeMonth(10n, 3n);

    expect(result.closedMonth).toMatchObject({ id: 3n, month: 6, year: 2026 });
    expect(prismaMock.month.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 3n }, data: expect.objectContaining({ status: 'closed' }) })
    );
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 10n, entity: 'month', entityId: 3n, action: 'close' }) })
    );
  });

  test('mês já fechado é rejeitado (409) e NÃO grava audit log nem gera nada', async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: 3n, status: 'closed', month: 6, year: 2026 }]);

    await expect(closeMonth(10n, 3n)).rejects.toMatchObject({ statusCode: 409, code: 'MONTH_ALREADY_CLOSED' });

    expect(prismaMock.month.update).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  test('mês inexistente/de outro usuário (lock não encontra linha) é rejeitado com 404', async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);

    await expect(closeMonth(10n, 999n)).rejects.toMatchObject({ statusCode: 404, code: 'MONTH_NOT_FOUND' });
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });
});

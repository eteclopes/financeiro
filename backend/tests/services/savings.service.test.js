const { createPrismaMock } = require('../helpers/prismaMock');

let prismaMock;
jest.mock('../../src/config/prisma', () => {
  const { createPrismaMock } = require('../helpers/prismaMock');
  return createPrismaMock();
});

// pega a MESMA instância que o mock de módulo acima devolveu, para poder
// configurar/inspecionar as chamadas nos testes
prismaMock = require('../../src/config/prisma');

const { installDefaults } = require('../helpers/prismaMock');
beforeEach(() => installDefaults(prismaMock));

const savingsService = require('../../src/modules/savings/savings.service');

describe('savings.service — deposit/withdraw (fix de condição de corrida)', () => {
  test('depósito sem transações anteriores parte de saldo zero e grava audit log', async () => {
    prismaMock.savingsTransaction.findFirst.mockResolvedValue(null);
    prismaMock.savingsTransaction.create.mockImplementation(({ data }) => Promise.resolve({ id: 1n, ...data }));

    const result = await savingsService.deposit(10n, { value: 100, date: new Date(), observation: null });

    expect(result.balanceAfter).toBe(100);
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ entity: 'savingsTransaction', action: 'deposit' }) })
    );
  });

  test('depósito soma corretamente em cima do último saldo (sem drift de ponto flutuante)', async () => {
    prismaMock.savingsTransaction.findFirst.mockResolvedValue({ balanceAfter: 10.1 });
    prismaMock.savingsTransaction.create.mockImplementation(({ data }) => Promise.resolve({ id: 2n, ...data }));

    const result = await savingsService.deposit(10n, { value: 20.2, date: new Date(), observation: null });

    // 10.10 + 20.20 em JS puro dá 30.299999999999997 — precisa fechar em 30.30
    expect(result.balanceAfter).toBe(30.3);
  });

  test('saque com saldo suficiente é aceito e desconta corretamente', async () => {
    prismaMock.savingsTransaction.findFirst.mockResolvedValue({ balanceAfter: 300 });
    prismaMock.savingsTransaction.create.mockImplementation(({ data }) => Promise.resolve({ id: 3n, ...data }));

    const result = await savingsService.withdraw(10n, { value: 120, date: new Date(), observation: null });

    expect(result.balanceAfter).toBe(180);
  });

  test('saque do saldo exato (dentro da tolerância de 0.009) é aceito, não rejeitado por arredondamento', async () => {
    prismaMock.savingsTransaction.findFirst.mockResolvedValue({ balanceAfter: 50 });
    prismaMock.savingsTransaction.create.mockImplementation(({ data }) => Promise.resolve({ id: 4n, ...data }));

    const result = await savingsService.withdraw(10n, { value: 50, date: new Date(), observation: null });

    expect(result.balanceAfter).toBe(0);
  });

  test('saque maior que o saldo disponível é rejeitado com AppError 409', async () => {
    prismaMock.savingsTransaction.findFirst.mockResolvedValue({ balanceAfter: 50 });

    await expect(
      savingsService.withdraw(10n, { value: 50.5, date: new Date(), observation: null })
    ).rejects.toMatchObject({ statusCode: 409, code: 'INSUFFICIENT_SAVINGS_BALANCE' });

    expect(prismaMock.savingsTransaction.create).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  test('REGRESSÃO: deposit precisa adquirir o lock consultivo por usuário antes de ler o saldo', async () => {
    const order = [];
    prismaMock.$executeRaw.mockImplementation(() => {
      order.push('lock');
      return Promise.resolve();
    });
    prismaMock.savingsTransaction.findFirst.mockImplementation(() => {
      order.push('read');
      return Promise.resolve(null);
    });
    prismaMock.savingsTransaction.create.mockImplementation(({ data }) => {
      order.push('write');
      return Promise.resolve({ id: 5n, ...data });
    });

    await savingsService.deposit(10n, { value: 10, date: new Date(), observation: null });

    // Se algum dia alguém remover o lock (ou movê-lo para depois da leitura),
    // este teste falha — é exatamente o bug corrigido nesta sessão.
    expect(order).toEqual(['lock', 'read', 'write']);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  test('REGRESSÃO: withdraw também adquire o lock antes de ler o saldo', async () => {
    prismaMock.savingsTransaction.findFirst.mockResolvedValue({ balanceAfter: 100 });
    prismaMock.savingsTransaction.create.mockImplementation(({ data }) => Promise.resolve({ id: 6n, ...data }));

    await savingsService.withdraw(10n, { value: 10, date: new Date(), observation: null });

    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });
});

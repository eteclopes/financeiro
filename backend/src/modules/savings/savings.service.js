const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');
const { recordAuditLog } = require('../auditLog/auditLog.service');
const { round2 } = require('../../utils/math');

async function getCurrentBalance(userId) {
  const last = await prisma.savingsTransaction.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  return last ? Number(last.balanceAfter) : 0;
}

async function listTransactions(userId) {
  return prisma.savingsTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * ITEM 6: Novo comportamento de depósito com origem.
 * - from_balance: desconta do saldo disponível (comportamento anterior)
 * - external: apenas registra na reserva, sem afetar o saldo da conta
 */
async function deposit(userId, { value, date, observation, origin = 'from_balance' }) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${userId})`;

    const last = await tx.savingsTransaction.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    const currentBalance = last ? Number(last.balanceAfter) : 0;
    const balanceAfter = round2(currentBalance + value);

    // Se origem = from_balance: desconta do saldo do mês (via savingsNet no dashboard)
    // Se origem = external: só registra na reserva, sem afetar saldo da conta

    return tx.savingsTransaction.create({
      data: { userId, type: 'deposit', value, transactionDate: date, observation, balanceAfter, origin },
    });
  }).then(async (created) => {
    await recordAuditLog(userId, 'savingsTransaction', created.id, 'deposit', { newValue: created });
    return created;
  });
}

async function withdraw(userId, { value, date, observation }) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${userId})`;

    const last = await tx.savingsTransaction.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    const currentBalance = last ? Number(last.balanceAfter) : 0;

    if (value > currentBalance + 0.009) {
      throw new AppError(
        `Saldo guardado insuficiente. Disponível: R$ ${currentBalance.toFixed(2)}.`,
        409,
        'INSUFFICIENT_SAVINGS_BALANCE'
      );
    }
    const balanceAfter = round2(currentBalance - value);

    return tx.savingsTransaction.create({
      data: { userId, type: 'withdraw', value, transactionDate: date, observation, balanceAfter, origin: 'from_balance' },
    });
  }).then(async (created) => {
    await recordAuditLog(userId, 'savingsTransaction', created.id, 'withdraw', { newValue: created });
    return created;
  });
}

async function updateLastTransaction(userId, transactionId, { value, date, observation }) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${userId})`;

    const last = await tx.savingsTransaction.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (!last || String(last.id) !== String(transactionId)) {
      throw new AppError(
        'Só é possível editar o lançamento mais recente do extrato de poupança.',
        409,
        'NOT_LAST_SAVINGS_TRANSACTION'
      );
    }

    const balanceBeforeThis = last.type === 'deposit'
      ? round2(Number(last.balanceAfter) - Number(last.value))
      : round2(Number(last.balanceAfter) + Number(last.value));

    if (last.type === 'withdraw' && value > balanceBeforeThis + 0.009) {
      throw new AppError(
        `Saldo guardado insuficiente para esse valor. Disponível antes: R$ ${balanceBeforeThis.toFixed(2)}.`,
        409,
        'INSUFFICIENT_SAVINGS_BALANCE'
      );
    }

    const balanceAfter = last.type === 'deposit'
      ? round2(balanceBeforeThis + value)
      : round2(balanceBeforeThis - value);

    const updated = await tx.savingsTransaction.update({
      where: { id: last.id },
      data: { value, transactionDate: date, observation, balanceAfter },
    });
    return { updated, oldValue: last };
  }).then(async ({ updated, oldValue }) => {
    await recordAuditLog(userId, 'savingsTransaction', updated.id, 'update', { oldValue, newValue: updated });
    return updated;
  });
}

async function deleteLastTransaction(userId, transactionId) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${userId})`;

    const last = await tx.savingsTransaction.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (!last || String(last.id) !== String(transactionId)) {
      throw new AppError(
        'Só é possível excluir o lançamento mais recente do extrato de poupança.',
        409,
        'NOT_LAST_SAVINGS_TRANSACTION'
      );
    }

    await tx.savingsTransaction.delete({ where: { id: last.id } });
    return last;
  }).then(async (deleted) => {
    await recordAuditLog(userId, 'savingsTransaction', deleted.id, 'delete', { oldValue: deleted });
    return deleted;
  });
}

/**
 * Soma líquida de movimentações de saldo guardado dentro de um intervalo.
 * IMPORTANTE: Depósitos de origem 'external' NÃO saem do saldo da conta,
 * então só contamos os 'from_balance' aqui para o cálculo do saldo disponível.
 */
async function getNetMovementInRange(userId, startDate, endDate) {
  const [deposits, withdraws] = await Promise.all([
    // Apenas depósitos "from_balance" afetam o saldo da conta
    prisma.savingsTransaction.aggregate({
      where: { userId, type: 'deposit', origin: 'from_balance', transactionDate: { gte: startDate, lte: endDate } },
      _sum: { value: true },
    }),
    prisma.savingsTransaction.aggregate({
      where: { userId, type: 'withdraw', transactionDate: { gte: startDate, lte: endDate } },
      _sum: { value: true },
    }),
  ]);

  return round2(Number(deposits._sum.value ?? 0) - Number(withdraws._sum.value ?? 0));
}

/**
 * Retorna estatísticas detalhadas da reserva para o frontend.
 */
async function getSavingsStats(userId) {
  const [allDeposits, externalDeposits, allWithdraws, balance] = await Promise.all([
    prisma.savingsTransaction.aggregate({
      where: { userId, type: 'deposit' },
      _sum: { value: true },
    }),
    prisma.savingsTransaction.aggregate({
      where: { userId, type: 'deposit', origin: 'external' },
      _sum: { value: true },
    }),
    prisma.savingsTransaction.aggregate({
      where: { userId, type: 'withdraw' },
      _sum: { value: true },
    }),
    getCurrentBalance(userId),
  ]);

  const totalDeposited = Number(allDeposits._sum.value ?? 0);
  const externalTotal = Number(externalDeposits._sum.value ?? 0);
  const fromBalanceTotal = round2(totalDeposited - externalTotal);

  return {
    totalReserved: balance,
    fromBalance: fromBalanceTotal,
    external: externalTotal,
    totalWithdrawn: Number(allWithdraws._sum.value ?? 0),
  };
}

module.exports = {
  getCurrentBalance,
  listTransactions,
  deposit,
  withdraw,
  updateLastTransaction,
  deleteLastTransaction,
  getNetMovementInRange,
  getSavingsStats,
};

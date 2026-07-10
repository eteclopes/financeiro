const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');
const { recordAuditLog } = require('../auditLog/auditLog.service');

function round2(value) {
  return Math.round(value * 100) / 100;
}

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

async function deposit(userId, { value, date, observation }) {
  // Sem lock, duas chamadas concorrentes (duplo clique, retry de rede) podem
  // ler o mesmo currentBalance e gravar dois balanceAfter incorretos (lost
  // update) — mesma classe de bug que closing.service.js já trava com
  // `FOR UPDATE`. Aqui não há uma linha "de saldo" para travar (o saldo é
  // derivado da última transação), então usamos um lock consultivo por
  // usuário: serializa apenas depósitos/saques do MESMO usuário entre si e
  // é liberado automaticamente ao fim da transação.
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${userId})`;

    const last = await tx.savingsTransaction.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    const currentBalance = last ? Number(last.balanceAfter) : 0;
    const balanceAfter = round2(currentBalance + value);

    // O depósito sai do "bolso" do mês corrente — por isso conta como saída
    // ao calcular o saldo atual do mês em que a movimentação ocorreu (ver
    // dashboard.service.js), senão o dinheiro existiria duplicado: no saldo
    // atual E no saldo guardado ao mesmo tempo.
    return tx.savingsTransaction.create({
      data: { userId, type: 'deposit', value, transactionDate: date, observation, balanceAfter },
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
      data: { userId, type: 'withdraw', value, transactionDate: date, observation, balanceAfter },
    });
  }).then(async (created) => {
    await recordAuditLog(userId, 'savingsTransaction', created.id, 'withdraw', { newValue: created });
    return created;
  });
}

/**
 * Soma líquida de movimentações de saldo guardado dentro de um intervalo de
 * datas (tipicamente o mês selecionado no dashboard). Depósito é saída de
 * caixa do mês (positivo aqui = deve ser subtraído do saldo atual);
 * retirada é entrada (negativo aqui = deve ser somado).
 */
async function getNetMovementInRange(userId, startDate, endDate) {
  const [deposits, withdraws] = await Promise.all([
    prisma.savingsTransaction.aggregate({
      where: { userId, type: 'deposit', transactionDate: { gte: startDate, lte: endDate } },
      _sum: { value: true },
    }),
    prisma.savingsTransaction.aggregate({
      where: { userId, type: 'withdraw', transactionDate: { gte: startDate, lte: endDate } },
      _sum: { value: true },
    }),
  ]);

  return round2(Number(deposits._sum.value ?? 0) - Number(withdraws._sum.value ?? 0));
}

module.exports = { getCurrentBalance, listTransactions, deposit, withdraw, getNetMovementInRange };

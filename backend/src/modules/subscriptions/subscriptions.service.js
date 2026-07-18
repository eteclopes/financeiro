const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');
const monthsService = require('../months/months.service');
const expensesService = require('../expenses/expenses.service');
const cardInvoicesService = require('../cards/cardInvoices.service');
const { round2 } = require('../../utils/math');
const { recordAuditLog } = require('../auditLog/auditLog.service');

/**
 * Calcula a próxima data de cobrança com base na periodicidade.
 */
function nextChargeDate(fromDate, periodicity, customDays) {
  const d = new Date(fromDate);
  if (periodicity === 'monthly') {
    d.setUTCMonth(d.getUTCMonth() + 1);
  } else if (periodicity === 'annual') {
    d.setUTCFullYear(d.getUTCFullYear() + 1);
  } else if (periodicity === 'custom' && customDays) {
    d.setUTCDate(d.getUTCDate() + customDays);
  }
  return d;
}

async function assertCategoryIsValid(userId, categoryId) {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, type: 'expense', OR: [{ userId: null }, { userId }] },
  });
  if (!category) {
    throw new AppError('Categoria de despesa inválida.', 422, 'INVALID_CATEGORY');
  }
}

async function createSubscription(userId, payload) {
  await assertCategoryIsValid(userId, payload.categoryId);

  // Valida cartão se forma de pagamento for crédito
  if (payload.paymentMethod === 'credit' && payload.cardId) {
    const card = await prisma.card.findFirst({ where: { id: payload.cardId, userId } });
    if (!card) throw new AppError('Cartão não encontrado.', 404, 'CARD_NOT_FOUND');
  }

  const subscription = await prisma.subscription.create({
    data: {
      userId,
      cardId: payload.paymentMethod === 'credit' ? payload.cardId : null,
      categoryId: payload.categoryId,
      description: payload.description,
      value: payload.value,
      periodicity: payload.periodicity ?? 'monthly',
      customDays: payload.customDays,
      paymentMethod: payload.paymentMethod ?? 'credit',
      nextChargeDate: new Date(payload.nextChargeDate),
      endDate: payload.endDate ? new Date(payload.endDate) : null,
      status: 'active',
    },
    include: { category: true, card: true },
  });

  await recordAuditLog(userId, 'subscription', subscription.id, 'create', { newValue: subscription });
  return subscription;
}

async function listSubscriptions(userId) {
  return prisma.subscription.findMany({
    where: { userId },
    include: { category: true, card: true },
    orderBy: { createdAt: 'desc' },
  });
}

async function updateSubscription(userId, subscriptionId, payload) {
  const sub = await prisma.subscription.findFirst({ where: { id: subscriptionId, userId } });
  if (!sub) throw new AppError('Assinatura não encontrada.', 404, 'SUBSCRIPTION_NOT_FOUND');

  if (payload.categoryId) await assertCategoryIsValid(userId, payload.categoryId);
  if (payload.paymentMethod === 'credit' && payload.cardId) {
    const card = await prisma.card.findFirst({ where: { id: payload.cardId, userId } });
    if (!card) throw new AppError('Cartão não encontrado.', 404, 'CARD_NOT_FOUND');
  }

  const updated = await prisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      ...(payload.description && { description: payload.description }),
      ...(payload.value !== undefined && { value: payload.value }),
      ...(payload.categoryId && { categoryId: payload.categoryId }),
      ...(payload.periodicity && { periodicity: payload.periodicity }),
      ...(payload.customDays !== undefined && { customDays: payload.customDays }),
      ...(payload.paymentMethod && { paymentMethod: payload.paymentMethod }),
      ...(payload.paymentMethod === 'credit' ? { cardId: payload.cardId ?? null } : { cardId: null }),
      ...(payload.nextChargeDate && { nextChargeDate: new Date(payload.nextChargeDate) }),
      ...(payload.endDate !== undefined && { endDate: payload.endDate ? new Date(payload.endDate) : null }),
    },
    include: { category: true, card: true },
  });

  await recordAuditLog(userId, 'subscription', subscriptionId, 'update', { oldValue: sub, newValue: updated });
  return updated;
}

async function pauseSubscription(userId, subscriptionId) {
  const sub = await prisma.subscription.findFirst({ where: { id: subscriptionId, userId } });
  if (!sub) throw new AppError('Assinatura não encontrada.', 404, 'SUBSCRIPTION_NOT_FOUND');
  if (sub.status === 'cancelled') throw new AppError('Assinatura já cancelada.', 409, 'SUBSCRIPTION_CANCELLED');

  const updated = await prisma.subscription.update({
    where: { id: subscriptionId },
    data: { status: sub.status === 'paused' ? 'active' : 'paused' },
    include: { category: true, card: true },
  });

  await recordAuditLog(userId, 'subscription', subscriptionId, 'pause', { oldValue: sub, newValue: updated });
  return updated;
}

async function cancelSubscription(userId, subscriptionId) {
  const sub = await prisma.subscription.findFirst({ where: { id: subscriptionId, userId } });
  if (!sub) throw new AppError('Assinatura não encontrada.', 404, 'SUBSCRIPTION_NOT_FOUND');

  const updated = await prisma.subscription.update({
    where: { id: subscriptionId },
    data: { status: 'cancelled' },
    include: { category: true, card: true },
  });

  await recordAuditLog(userId, 'subscription', subscriptionId, 'cancel', { oldValue: sub, newValue: updated });
  return updated;
}

module.exports = {
  createSubscription,
  listSubscriptions,
  updateSubscription,
  pauseSubscription,
  cancelSubscription,
};

const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');
const { recordAuditLog } = require('../auditLog/auditLog.service');

// Status que ainda "consomem" limite — uma vez paga, a parcela libera limite,
// mesmo que o cartão físico real só libere no ciclo seguinte (simplificação
// deliberada documentada na auditoria final).
const OPEN_EXPENSE_STATUSES = ['pending', 'partial', 'late'];

// client opcional (default = singleton) para permitir chamar de dentro de
// uma transação — ver cardPurchases.service.js (lock antes de checar limite).
async function computeUsedLimit(cardId, client = prisma) {
  const result = await client.expense.aggregate({
    where: { type: 'card', status: { in: OPEN_EXPENSE_STATUSES }, cardInvoice: { cardId } },
    _sum: { value: true },
  });
  return Number(result._sum.value ?? 0);
}

/**
 * Versão em lote de computeUsedLimit: 1 query para N cartões (em vez de 1
 * por cartão). Usada por listCards e por qualquer outro módulo que precise
 * do usedLimit de vários cartões de uma vez (financialHealth, alerts —
 * ambos tinham o mesmo N+1 duplicado antes desta função existir).
 */
async function computeUsedLimitsByCard(cardIds, client = prisma) {
  if (cardIds.length === 0) return new Map();

  const openExpenses = await client.expense.findMany({
    where: { type: 'card', status: { in: OPEN_EXPENSE_STATUSES }, cardInvoice: { cardId: { in: cardIds } } },
    select: { value: true, cardInvoice: { select: { cardId: true } } },
  });

  const usedLimitByCard = new Map();
  for (const expense of openExpenses) {
    const key = String(expense.cardInvoice.cardId);
    usedLimitByCard.set(key, (usedLimitByCard.get(key) ?? 0) + Number(expense.value));
  }
  return usedLimitByCard;
}

/**
 * Antes: 1 query para listar os cartões + 1 query de agregação POR cartão
 * (N+1 clássico). Agora: sempre 2 queries no total, não importa quantos
 * cartões o usuário tenha — busca todas as parcelas em aberto de todos os
 * cartões de uma vez e soma por cartão em memória.
 */
async function listCards(userId) {
  const cards = await prisma.card.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  if (cards.length === 0) return [];

  const usedLimitByCard = await computeUsedLimitsByCard(cards.map((c) => c.id));

  return cards.map((card) => {
    const usedLimit = usedLimitByCard.get(String(card.id)) ?? 0;
    return {
      ...card,
      usedLimit,
      availableLimit: Math.max(Number(card.limitValue) - usedLimit, 0),
    };
  });
}

async function createCard(userId, payload) {
  const card = await prisma.card.create({ data: { userId, ...payload, active: true } });
  await recordAuditLog(userId, 'card', card.id, 'create', { newValue: card });
  return card;
}

async function getOwnedCardOrThrow(userId, cardId) {
  const card = await prisma.card.findFirst({ where: { id: cardId, userId } });
  if (!card) {
    throw new AppError('Cartão não encontrado.', 404, 'CARD_NOT_FOUND');
  }
  return card;
}

async function updateCard(userId, cardId, payload) {
  const before = await getOwnedCardOrThrow(userId, cardId);
  const updated = await prisma.card.update({ where: { id: cardId }, data: payload });
  await recordAuditLog(userId, 'card', cardId, 'update', { oldValue: before, newValue: updated });
  return updated;
}

async function deactivateCard(userId, cardId) {
  const before = await getOwnedCardOrThrow(userId, cardId);
  // Cartão com parcelas futuras pendentes não pode simplesmente sumir do
  // sistema — apenas para de aceitar novas compras; faturas já geradas
  // continuam existindo e precisam ser pagas normalmente.
  const updated = await prisma.card.update({ where: { id: cardId }, data: { active: false } });
  await recordAuditLog(userId, 'card', cardId, 'deactivate', { oldValue: before, newValue: updated });
  return updated;
}

module.exports = {
  listCards,
  createCard,
  getOwnedCardOrThrow,
  updateCard,
  deactivateCard,
  computeUsedLimit,
  computeUsedLimitsByCard,
};

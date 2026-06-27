const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');

// Status que ainda "consomem" limite — uma vez paga, a parcela libera limite,
// mesmo que o cartão físico real só libere no ciclo seguinte (simplificação
// deliberada documentada na auditoria final).
const OPEN_EXPENSE_STATUSES = ['pending', 'partial', 'late'];

async function computeUsedLimit(cardId) {
  const result = await prisma.expense.aggregate({
    where: { type: 'card', status: { in: OPEN_EXPENSE_STATUSES }, cardInvoice: { cardId } },
    _sum: { value: true },
  });
  return Number(result._sum.value ?? 0);
}

async function listCards(userId) {
  const cards = await prisma.card.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });

  return Promise.all(
    cards.map(async (card) => {
      const usedLimit = await computeUsedLimit(card.id);
      return {
        ...card,
        usedLimit,
        availableLimit: Math.max(Number(card.limitValue) - usedLimit, 0),
      };
    })
  );
}

async function createCard(userId, payload) {
  return prisma.card.create({ data: { userId, ...payload, active: true } });
}

async function getOwnedCardOrThrow(userId, cardId) {
  const card = await prisma.card.findFirst({ where: { id: cardId, userId } });
  if (!card) {
    throw new AppError('Cartão não encontrado.', 404, 'CARD_NOT_FOUND');
  }
  return card;
}

async function updateCard(userId, cardId, payload) {
  await getOwnedCardOrThrow(userId, cardId);
  return prisma.card.update({ where: { id: cardId }, data: payload });
}

async function deactivateCard(userId, cardId) {
  await getOwnedCardOrThrow(userId, cardId);
  // Cartão com parcelas futuras pendentes não pode simplesmente sumir do
  // sistema — apenas para de aceitar novas compras; faturas já geradas
  // continuam existindo e precisam ser pagas normalmente.
  return prisma.card.update({ where: { id: cardId }, data: { active: false } });
}

module.exports = { listCards, createCard, getOwnedCardOrThrow, updateCard, deactivateCard, computeUsedLimit };

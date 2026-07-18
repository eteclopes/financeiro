const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');
const monthsService = require('../months/months.service');
const { round2 } = require('../../utils/math');

function assertDateMatchesMonth(date, month) {
  const matches = date.getUTCMonth() + 1 === month.month && date.getUTCFullYear() === month.year;
  if (!matches) {
    throw new AppError('A data informada não pertence ao mês selecionado.', 422, 'DATE_OUTSIDE_MONTH');
  }
}

function dueDateFromDay(month, day) {
  // Dia de vencimento maior que os dias do mês (ex.: dia 31 em fevereiro)
  // cai automaticamente no último dia válido daquele mês.
  const lastDayOfMonth = new Date(Date.UTC(month.year, month.month, 0)).getUTCDate();
  const safeDay = Math.min(day, lastDayOfMonth);
  return new Date(Date.UTC(month.year, month.month - 1, safeDay));
}

async function assertCategoryIsValid(userId, categoryId) {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, type: 'expense', OR: [{ userId: null }, { userId }] },
  });
  if (!category) {
    throw new AppError('Categoria de despesa inválida.', 422, 'INVALID_CATEGORY');
  }
}

/**
 * BLOQUEIO DE SALDO INSUFICIENTE (Item 3 do prompt)
 * Calcula o saldo disponível atual do usuário no mês.
 * saldo = receitas - despesas pagas - saldo guardado (savings net) - goals net
 */
async function getAvailableBalance(userId, monthId) {
  const month = await monthsService.getMonthOrThrow(userId, monthId);

  const [incomesAgg, paidAgg] = await Promise.all([
    prisma.income.aggregate({ where: { userId, monthId }, _sum: { value: true } }),
    prisma.expense.aggregate({
      where: { userId, monthId, deletedAt: null, status: { in: ['paid', 'settled'] } },
      _sum: { paidAmount: true },
    }),
  ]);

  const savingsService = require('../savings/savings.service');
  const startDate = new Date(Date.UTC(month.year, month.month - 1, 1));
  const endDate = new Date(Date.UTC(month.year, month.month, 0, 23, 59, 59));
  const savingsNet = await savingsService.getNetMovementInRange(userId, startDate, endDate);

  // Para savings depositados "externamente" NÃO descontamos do saldo da conta
  const externalSavingsAgg = await prisma.savingsTransaction.aggregate({
    where: { userId, type: 'deposit', origin: 'external', transactionDate: { gte: startDate, lte: endDate } },
    _sum: { value: true },
  });
  const externalSavings = Number(externalSavingsAgg._sum.value ?? 0);

  const incomeTotal = Number(incomesAgg._sum.value ?? 0);
  const expensesPaid = Number(paidAgg._sum.paidAmount ?? 0);
  // savingsNet = total deposits - total withdraws; external deposits não saem do saldo
  const effectiveSavingsNet = round2(savingsNet - externalSavings);

  return round2(incomeTotal - expensesPaid - effectiveSavingsNet);
}

/**
 * Verifica se há saldo suficiente para o pagamento.
 * Lança AppError se não houver saldo.
 */
async function assertSufficientBalance(userId, monthId, amount) {
  const available = await getAvailableBalance(userId, monthId);
  if (amount > available + 0.009) {
    throw new AppError(
      `Saldo insuficiente. Disponível: R$ ${available.toFixed(2)}. Necessário: R$ ${amount.toFixed(2)}.`,
      422,
      'INSUFFICIENT_BALANCE'
    );
  }
}

/**
 * Aplica a regra "Status = Atrasado" (due_date no passado e ainda não pago)
 * antes de qualquer listagem.
 */
async function syncOverdueStatuses(userId, monthId) {
  await prisma.expense.updateMany({
    where: {
      userId,
      monthId,
      status: { in: ['pending', 'partial'] },
      dueDate: { lt: new Date() },
    },
    data: { status: 'late' },
  });
}

async function listExpenses(userId, monthId, type) {
  await monthsService.getMonthOrThrow(userId, monthId);
  await syncOverdueStatuses(userId, monthId);

  return prisma.expense.findMany({
    where: { userId, monthId, deletedAt: null, ...(type ? { type } : {}) },
    include: { category: true, debt: true, cardInvoice: true },
    orderBy: { dueDate: 'asc' },
  });
}

// ---------------- Despesa Variável ----------------

async function createVariableExpense(userId, payload) {
  const month = await monthsService.getMonthOrThrow(userId, payload.monthId);
  monthsService.assertMonthIsOpen(month);
  assertDateMatchesMonth(payload.date, month);
  await assertCategoryIsValid(userId, payload.categoryId);

  // Se já vai ser paga imediatamente (paid=true), verifica saldo disponível
  // apenas se a forma de pagamento NÃO for cartão de crédito
  if (payload.paid && payload.paymentMethod !== 'credit') {
    await assertSufficientBalance(userId, payload.monthId, payload.value);
  }

  return prisma.expense.create({
    data: {
      userId,
      monthId: payload.monthId,
      type: 'variable',
      description: payload.description,
      categoryId: payload.categoryId,
      dueDate: payload.date,
      value: payload.value,
      paidAmount: payload.paid ? payload.value : 0,
      status: payload.paid ? 'paid' : 'pending',
      paymentMethod: payload.paid ? payload.paymentMethod : null,
      observation: payload.observation,
    },
    include: { category: true },
  });
}

// ---------------- Despesa Fixa ----------------

async function createFixedExpense(userId, payload) {
  const month = await monthsService.getMonthOrThrow(userId, payload.monthId);
  monthsService.assertMonthIsOpen(month);
  await assertCategoryIsValid(userId, payload.categoryId);

  // Valida cartão se forma de pagamento for crédito
  if (payload.paymentMethod === 'credit' && payload.cardId) {
    const card = await prisma.card.findFirst({ where: { id: BigInt(payload.cardId), userId } });
    if (!card) throw new AppError('Cartão não encontrado.', 404, 'CARD_NOT_FOUND');
  }

  return prisma.$transaction(async (tx) => {
    const template = await tx.fixedExpenseTemplate.create({
      data: {
        userId,
        description: payload.description,
        categoryId: payload.categoryId,
        value: payload.value,
        dueDay: payload.dueDay,
        active: true,
        paymentMethod: payload.paymentMethod ?? 'pix',
        cardId: payload.paymentMethod === 'credit' ? (payload.cardId ? BigInt(payload.cardId) : null) : null,
      },
    });

    return tx.expense.create({
      data: {
        userId,
        monthId: payload.monthId,
        type: 'fixed',
        description: payload.description,
        categoryId: payload.categoryId,
        dueDate: dueDateFromDay(month, payload.dueDay),
        value: payload.value,
        status: 'pending',
        fixedTemplateId: template.id,
        observation: payload.observation,
      },
      include: { category: true, fixedTemplate: true },
    });
  });
}

async function deactivateFixedTemplate(userId, templateId) {
  const template = await prisma.fixedExpenseTemplate.findFirst({ where: { id: templateId, userId } });
  if (!template) {
    throw new AppError('Despesa fixa não encontrada.', 404, 'FIXED_TEMPLATE_NOT_FOUND');
  }
  return prisma.fixedExpenseTemplate.update({ where: { id: templateId }, data: { active: false } });
}

async function updateFixedTemplate(userId, templateId, payload) {
  const template = await prisma.fixedExpenseTemplate.findFirst({ where: { id: templateId, userId } });
  if (!template) {
    throw new AppError('Despesa fixa não encontrada.', 404, 'FIXED_TEMPLATE_NOT_FOUND');
  }
  if (payload.categoryId) {
    await assertCategoryIsValid(userId, payload.categoryId);
  }
  // Valida cartão se mudar para crédito
  if (payload.paymentMethod === 'credit' && payload.cardId) {
    const card = await prisma.card.findFirst({ where: { id: BigInt(payload.cardId), userId } });
    if (!card) throw new AppError('Cartão não encontrado.', 404, 'CARD_NOT_FOUND');
  }
  return prisma.fixedExpenseTemplate.update({
    where: { id: templateId },
    data: {
      ...(payload.description && { description: payload.description }),
      ...(payload.value !== undefined && { value: payload.value }),
      ...(payload.categoryId && { categoryId: payload.categoryId }),
      ...(payload.dueDay !== undefined && { dueDay: payload.dueDay }),
      ...(payload.paymentMethod && { paymentMethod: payload.paymentMethod }),
      ...(payload.paymentMethod === 'credit' ? { cardId: payload.cardId ? BigInt(payload.cardId) : null } : {}),
      ...(payload.paymentMethod && payload.paymentMethod !== 'credit' ? { cardId: null } : {}),
    },
    include: { category: true },
  });
}

async function deleteFixedTemplate(userId, templateId) {
  const template = await prisma.fixedExpenseTemplate.findFirst({ where: { id: templateId, userId } });
  if (!template) {
    throw new AppError('Despesa fixa não encontrada.', 404, 'FIXED_TEMPLATE_NOT_FOUND');
  }

  return prisma.$transaction(async (tx) => {
    await tx.expense.deleteMany({
      where: {
        fixedTemplateId: templateId,
        status: { in: ['pending', 'partial', 'late'] },
        month: { status: 'open' },
      },
    });

    const instanceCount = await tx.expense.count({ where: { fixedTemplateId: templateId } });
    if (instanceCount > 0) {
      return tx.fixedExpenseTemplate.update({ where: { id: templateId }, data: { active: false } });
    }
    return tx.fixedExpenseTemplate.delete({ where: { id: templateId } });
  });
}

// ---------------- Edição / exclusão ----------------

async function getOwnedExpenseOrThrow(userId, expenseId) {
  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, userId, deletedAt: null },
    include: { month: true, debt: true },
  });
  if (!expense) {
    throw new AppError('Despesa não encontrada.', 404, 'EXPENSE_NOT_FOUND');
  }
  return expense;
}

function assertEditableType(expense) {
  if (expense.type === 'card') {
    throw new AppError(
      'Parcelas de cartão não podem ser editadas/excluídas diretamente — gerencie pela fatura de origem.',
      409,
      'EXPENSE_TYPE_NOT_EDITABLE'
    );
  }
}

function assertValueIsEditable(expense, payload) {
  if (expense.type === 'priority' && payload.value !== undefined) {
    throw new AppError(
      'O valor da parcela é controlado pela dívida de origem e não pode ser editado diretamente.',
      409,
      'INSTALLMENT_VALUE_NOT_EDITABLE'
    );
  }
}

async function updateExpense(userId, expenseId, payload) {
  const expense = await getOwnedExpenseOrThrow(userId, expenseId);
  assertEditableType(expense);
  assertValueIsEditable(expense, payload);
  monthsService.assertMonthIsOpen(expense.month);

  const effectiveDate = payload.dueDate ?? expense.dueDate;
  assertDateMatchesMonth(effectiveDate, expense.month);

  if (payload.categoryId) {
    await assertCategoryIsValid(userId, payload.categoryId);
  }

  return prisma.expense.update({
    where: { id: expenseId },
    data: {
      ...(payload.description && { description: payload.description }),
      ...(payload.value !== undefined && { value: payload.value }),
      ...(payload.categoryId && { categoryId: payload.categoryId }),
      ...(payload.dueDate && { dueDate: payload.dueDate }),
      ...(payload.observation !== undefined && { observation: payload.observation }),
    },
    include: { category: true },
  });
}

async function deleteExpense(userId, expenseId) {
  const expense = await getOwnedExpenseOrThrow(userId, expenseId);
  assertEditableType(expense);
  if (expense.type === 'priority') {
    throw new AppError(
      'Parcelas de dívida não podem ser excluídas individualmente — exclua a dívida de origem.',
      409,
      'EXPENSE_TYPE_NOT_EDITABLE'
    );
  }
  monthsService.assertMonthIsOpen(expense.month);
  await prisma.expense.delete({ where: { id: expenseId } });
}

// ---------------- Pagamento (ITEM 3: bloqueio de saldo insuficiente) ----------------

async function payExpense(userId, expenseId, { amount, paymentMethod }) {
  const expense = await getOwnedExpenseOrThrow(userId, expenseId);

  if (expense.type === 'card') {
    throw new AppError(
      'Parcelas de cartão são quitadas pagando a fatura inteira, não individualmente.',
      409,
      'PAY_VIA_INVOICE'
    );
  }

  if (['paid', 'settled'].includes(expense.status)) {
    throw new AppError('Esta despesa já está paga.', 409, 'EXPENSE_ALREADY_PAID');
  }

  // BLOQUEIO: verificar saldo antes de pagar (exceto cartão de crédito,
  // que já vai para fatura e não desconta do saldo imediatamente)
  if (paymentMethod !== 'credit') {
    await assertSufficientBalance(userId, expense.monthId, amount);
  }

  if (expense.type === 'priority') {
    const debtsService = require('../debts/debts.service');
    return debtsService.applyPaymentToInstallment(userId, expense, amount, paymentMethod);
  }

  if (Math.abs(amount - Number(expense.value)) > 0.009) {
    throw new AppError(
      'Esta despesa exige pagamento do valor exato. Para pagamento flexível, use uma despesa de prioridade.',
      422,
      'EXACT_PAYMENT_REQUIRED'
    );
  }

  return {
    expense: await prisma.expense.update({
      where: { id: expenseId },
      data: { paidAmount: amount, status: 'paid', paymentMethod },
      include: { category: true },
    }),
    debt: null,
  };
}

module.exports = {
  listExpenses,
  createVariableExpense,
  createFixedExpense,
  deactivateFixedTemplate,
  updateFixedTemplate,
  deleteFixedTemplate,
  updateExpense,
  deleteExpense,
  payExpense,
  dueDateFromDay,
  assertCategoryIsValid,
  assertDateMatchesMonth,
  getAvailableBalance,
  assertSufficientBalance,
};

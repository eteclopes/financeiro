const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');
const monthsService = require('../months/months.service');

function assertDateMatchesMonth(date, month) {
  const matches = date.getUTCMonth() + 1 === month.month && date.getUTCFullYear() === month.year;
  if (!matches) {
    throw new AppError('A data informada não pertence ao mês selecionado.', 422, 'DATE_OUTSIDE_MONTH');
  }
}

function dueDateFromDay(month, day) {
  // Dia de vencimento maior que os dias do mês (ex.: dia 31 em fevereiro)
  // cai automaticamente no último dia válido daquele mês, em vez de
  // estourar para o mês seguinte (comportamento padrão do construtor Date).
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
 * Aplica a regra "Status = Atrasado" (due_date no passado e ainda não pago)
 * antes de qualquer listagem. Não há worker/cron nesta entrega — o reflexo
 * é feito sob demanda, o que é suficiente na escala de um usuário mas vira
 * um ponto a revisar (job agendado) quando o sistema crescer para milhares
 * de usuários consultando dashboards raramente.
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

  return prisma.$transaction(async (tx) => {
    const template = await tx.fixedExpenseTemplate.create({
      data: {
        userId,
        description: payload.description,
        categoryId: payload.categoryId,
        value: payload.value,
        dueDay: payload.dueDay,
        active: true,
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
  // Altera apenas o template — instâncias passadas permanecem inalteradas (histórico imutável).
  return prisma.fixedExpenseTemplate.update({
    where: { id: templateId },
    data: {
      ...(payload.description && { description: payload.description }),
      ...(payload.value !== undefined && { value: payload.value }),
      ...(payload.categoryId && { categoryId: payload.categoryId }),
      ...(payload.dueDay !== undefined && { dueDay: payload.dueDay }),
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
    // Remove na hora a(s) instância(s) ainda pendentes/atrasadas/parciais
    // em meses abertos — é isso que faz a despesa "sumir" imediatamente da
    // tela em vez de só deixar de ser gerada a partir do próximo fechamento.
    // Instâncias já pagas e instâncias de meses fechados (histórico
    // imutável) nunca são tocadas aqui, mesmo que o template seja apagado.
    await tx.expense.deleteMany({
      where: {
        fixedTemplateId: templateId,
        status: { in: ['pending', 'partial', 'late'] },
        month: { status: 'open' },
      },
    });

    // Soft-delete via desativação — preserva instâncias já pagas/históricas
    // e impede a geração de novas instâncias em fechamentos futuros.
    // Exclusão física do template só é possível se ele nunca gerou nenhuma instância.
    const instanceCount = await tx.expense.count({ where: { fixedTemplateId: templateId } });
    if (instanceCount > 0) {
      return tx.fixedExpenseTemplate.update({ where: { id: templateId }, data: { active: false } });
    }
    return tx.fixedExpenseTemplate.delete({ where: { id: templateId } });
  });
}

// ---------------- Edição / exclusão (variável e fixa apenas) ----------------

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

/**
 * Parcela de dívida (priority) pode ter descrição/categoria/data/observação
 * editadas livremente, mas o VALOR é sempre derivado do saldo devedor da
 * dívida (debts.service.computeInstallmentValue) — editar o valor aqui
 * direto, fora desse cálculo, corromperia remainingBalance silenciosamente.
 * Quem quiser mudar o valor da parcela precisa editar a dívida de origem.
 */
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
  // Só alcança este ponto se o mês ainda está aberto, então excluir
  // fisicamente não fere a regra de histórico imutável (mês fechado nunca
  // chega aqui — assertMonthIsOpen barra antes).
  await prisma.expense.delete({ where: { id: expenseId } });
}

// ---------------- Pagamento (genérico, delega dívida flexível ao módulo debts) ----------------

async function payExpense(userId, expenseId, { amount, paymentMethod }) {
  const expense = await getOwnedExpenseOrThrow(userId, expenseId);
  // Importante: aqui NÃO chamamos assertMonthIsOpen. Pagar uma conta atrasada
  // de um mês já fechado é uma ação legítima e esperada (é justamente para
  // isso que existe o status "Atrasado") — ela registra um fato novo ("foi
  // pago em tal data"), sem reescrever o valor/categoria/data originais do
  // lançamento. Isso é diferente de editar ou excluir o lançamento em si,
  // que continuam bloqueados em mês fechado por updateExpense/deleteExpense.

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

  if (expense.type === 'priority') {
    // Lazy require evita dependência circular no carregamento dos módulos
    // (debts.service nunca precisa importar expenses.service de volta).
    const debtsService = require('../debts/debts.service');
    return debtsService.applyPaymentToInstallment(userId, expense, amount, paymentMethod);
  }

  // Fixa e variável (quando criada como pendente): a regra do projeto não
  // previu pagamento flexível fora de dívidas de prioridade, então aqui
  // exigimos o valor exato — evita criar saldo residual "invisível" em
  // contas que o usuário nunca pediu para serem flexíveis.
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
};
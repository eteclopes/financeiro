const prisma = require('../../config/prisma');
const AppError = require('../../utils/AppError');

async function assertCategoryIsValid(userId, categoryId, type) {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, type, OR: [{ userId: null }, { userId }] },
  });
  if (!category) {
    throw new AppError(`Categoria de ${type === 'income' ? 'receita' : 'despesa'} inválida.`, 422, 'INVALID_CATEGORY');
  }
  return category;
}

async function listCategories(userId, type) {
  return prisma.category.findMany({
    where: {
      type,
      OR: [{ userId: null }, { userId }],
    },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });
}

async function createCategory(userId, { name, type }) {
  const existing = await prisma.category.findFirst({
    where: { type, name, OR: [{ userId: null }, { userId }] },
  });
  if (existing) {
    throw new AppError('Já existe uma categoria com este nome.', 409, 'CATEGORY_ALREADY_EXISTS');
  }

  return prisma.category.create({ data: { userId, name, type, isDefault: false } });
}

async function deleteCategory(userId, categoryId) {
  const category = await prisma.category.findFirst({ where: { id: categoryId, userId } });
  if (!category) {
    // Categorias padrão (userId null) nunca são encontradas aqui de propósito —
    // usuário não pode excluir categoria do sistema, só as próprias.
    throw new AppError('Categoria não encontrada.', 404, 'CATEGORY_NOT_FOUND');
  }

  // Categoria em uso não pode ser excluída fisicamente — quebraria FK de
  // receitas/despesas já lançadas e o histórico imutável dessas instâncias.
  const inUse = await prisma.$transaction([
    prisma.income.count({ where: { categoryId } }),
    prisma.expense.count({ where: { categoryId } }),
  ]);
  if (inUse.some((count) => count > 0)) {
    throw new AppError(
      'Esta categoria já foi usada em lançamentos e não pode ser excluída.',
      409,
      'CATEGORY_IN_USE'
    );
  }

  await prisma.category.delete({ where: { id: categoryId } });
}

module.exports = { listCategories, createCategory, deleteCategory };

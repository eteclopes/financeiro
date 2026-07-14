const prisma = require('../../config/prisma');

// Por tipo de entidade, não no total — evita que um termo muito genérico
// (ex.: "a") devolva uma lista dominada por um único tipo de resultado.
const RESULTS_PER_TYPE = 5;
const MIN_QUERY_LENGTH = 2;

/**
 * Busca global por texto, usada pela barra de pesquisa do Topbar. Cobre as
 * entidades que o usuário normalmente reconhece pelo nome/descrição:
 * despesas, receitas, dívidas, cartões e metas — na prática, tudo que tem
 * um campo de texto livre digitado pelo próprio usuário (categorias não
 * entram: são poucas e já aparecem inteiras em qualquer seletor).
 *
 * Não pagina nem ordena por relevância — é pensada para "encontrar aquele
 * lançamento/dívida/cartão que eu lembro o nome", não para uma busca
 * analítica. Cada tipo é limitado a `RESULTS_PER_TYPE` resultados mais
 * recentes/relevantes, para a lista caber num dropdown sem rolagem longa.
 */
async function search(userId, query) {
  const q = (query ?? '').trim();
  if (q.length < MIN_QUERY_LENGTH) return { results: [] };

  const contains = { contains: q, mode: 'insensitive' };

  const [expenses, incomes, debts, cards, goals] = await Promise.all([
    prisma.expense.findMany({
      where: { userId, deletedAt: null, description: contains },
      include: { month: { select: { month: true, year: true } } },
      orderBy: { createdAt: 'desc' },
      take: RESULTS_PER_TYPE,
    }),
    prisma.income.findMany({
      where: { userId, description: contains },
      include: { month: { select: { month: true, year: true } } },
      orderBy: { createdAt: 'desc' },
      take: RESULTS_PER_TYPE,
    }),
    prisma.debt.findMany({
      where: { userId, description: contains },
      orderBy: { createdAt: 'desc' },
      take: RESULTS_PER_TYPE,
    }),
    prisma.card.findMany({
      where: { userId, name: contains },
      take: RESULTS_PER_TYPE,
    }),
    prisma.goal.findMany({
      where: { userId, name: contains },
      take: RESULTS_PER_TYPE,
    }),
  ]);

  // Mapa único de tipo -> aba em ExpensesPage (o app não tem uma rota
  // separada para dívidas: elas vivem na aba "priority" de /expenses).
  const expenseTab = { priority: 'priority', fixed: 'fixed', variable: 'variable', card: 'variable' };

  const results = [
    ...expenses.map((e) => ({
      type: 'expense',
      id: e.id.toString(),
      label: e.description,
      subtitle: `R$ ${Number(e.value).toFixed(2)} · ${String(e.month.month).padStart(2, '0')}/${e.month.year}`,
      monthId: e.monthId.toString(),
      route: '/expenses',
      tab: expenseTab[e.type] ?? 'variable',
    })),
    ...incomes.map((i) => ({
      type: 'income',
      id: i.id.toString(),
      label: i.description,
      subtitle: `R$ ${Number(i.value).toFixed(2)} · ${String(i.month.month).padStart(2, '0')}/${i.month.year}`,
      monthId: i.monthId.toString(),
      route: '/incomes',
    })),
    ...debts.map((d) => ({
      type: 'debt',
      id: d.id.toString(),
      label: d.description,
      subtitle: `Saldo devedor: R$ ${Number(d.remainingBalance).toFixed(2)} · ${d.status === 'active' ? 'ativa' : d.status === 'settled' ? 'quitada' : d.status}`,
      route: '/expenses',
      tab: 'priority',
    })),
    ...cards.map((c) => ({
      type: 'card',
      id: c.id.toString(),
      label: c.name,
      subtitle: `Limite: R$ ${Number(c.limitValue).toFixed(2)}`,
      route: '/cards',
    })),
    ...goals.map((g) => ({
      type: 'goal',
      id: g.id.toString(),
      label: g.name,
      subtitle: `Meta: R$ ${Number(g.targetValue).toFixed(2)}`,
      route: '/goals',
    })),
  ];

  return { results };
}

module.exports = { search };

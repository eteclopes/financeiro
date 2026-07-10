const prisma = require('../../config/prisma');
const monthsService = require('../months/months.service');
const debtsService = require('../debts/debts.service');
const { addMonths } = require('../../utils/monthMath');

function round2(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Simula (SEM gravar nada no banco) o cronograma de parcelas de cada
 * dívida ativa para os próximos `monthsAhead` meses, reaproveitando a
 * mesma fórmula usada de verdade no fechamento mensal
 * (debtsService.computeInstallmentValue) — garante que a projeção bate
 * com o que o sistema realmente vai cobrar quando o mês chegar.
 */
/**
 * Cronograma de UMA dívida específica, com saldo devedor inicial
 * sobrescrevível — é o que permite ao simulador "E Se" testar "e se eu
 * antecipasse R$X" sem duplicar a fórmula de cálculo de parcela.
 */
async function getSingleDebtSchedule(debt, monthsAhead, remainingBalanceOverride = null) {
  const installmentsGenerated = await prisma.expense.count({ where: { debtId: debt.id } });
  const schedule = new Array(monthsAhead).fill(0);

  let remaining = remainingBalanceOverride ?? Number(debt.remainingBalance);
  let generated = installmentsGenerated;

  for (let i = 0; i < monthsAhead; i += 1) {
    const installmentsRemaining = debt.installmentsCount - generated;
    if (installmentsRemaining <= 0 || remaining <= 0.009) break;
    const value = debtsService.computeInstallmentValue(remaining, installmentsRemaining, Number(debt.installmentValue));
    schedule[i] = round2(value);
    remaining = round2(remaining - value);
    generated += 1;
  }

  return schedule;
}

async function getDebtInstallmentSchedule(userId, monthsAhead) {
  const debts = await prisma.debt.findMany({ where: { userId, status: 'active' } });
  const schedule = new Array(monthsAhead).fill(0);

  // Antes: `for (const debt of debts) { await getSingleDebtSchedule(...) }`
  // rodava uma dívida de cada vez, em série — com N dívidas ativas, N
  // round-trips ao banco um atrás do outro. Mesmo cálculo, mesmas queries,
  // agora disparadas em paralelo (Promise.all) em vez de esperar uma
  // terminar para começar a próxima.
  const perDebtSchedules = await Promise.all(debts.map((debt) => getSingleDebtSchedule(debt, monthsAhead)));
  for (const debtSchedule of perDebtSchedules) {
    for (let i = 0; i < monthsAhead; i += 1) {
      schedule[i] = round2(schedule[i] + debtSchedule[i]);
    }
  }

  return schedule;
}

/**
 * Parcelas de cartão futuras já existem como `expenses` reais (toda a
 * compra parcelada gera todas as parcelas de uma vez — ver
 * cardPurchases.service.js), então aqui é só somar o que já está
 * agendado, sem simular nada.
 */
async function getCardInstallmentsForMonth(userId, refMonth, refYear) {
  const month = await prisma.month.findUnique({
    where: { userId_month_year: { userId, month: refMonth, year: refYear } },
  });
  if (!month) return 0;

  const agg = await prisma.expense.aggregate({
    where: { userId, monthId: month.id, type: 'card', deletedAt: null },
    _sum: { value: true },
  });
  return Number(agg._sum.value ?? 0);
}

async function getActiveRecurringTotals(userId) {
  const [incomeAgg, fixedAgg] = await Promise.all([
    prisma.incomeTemplate.aggregate({ where: { userId, active: true }, _sum: { value: true } }),
    prisma.fixedExpenseTemplate.aggregate({ where: { userId, active: true }, _sum: { value: true } }),
  ]);
  return {
    income: Number(incomeAgg._sum.value ?? 0),
    fixedExpenses: Number(fixedAgg._sum.value ?? 0),
  };
}

/**
 * Componentes brutos da projeção, antes de "mesclar" em net mensal —
 * reaproveitados pelo simulador "E Se" para aplicar cenários (quitar
 * dívida, aumentar renda etc.) em cima dos mesmos números reais.
 */
async function getProjectionComponents(userId, startMonthId, monthsAhead) {
  const startMonth = await monthsService.getMonthOrThrow(userId, startMonthId);

  const months = [];
  for (let i = 0; i < monthsAhead; i += 1) {
    months.push(addMonths(startMonth.month, startMonth.year, i));
  }

  // Antes: `for (...) { cardSchedule.push(await getCardInstallmentsForMonth(...)) }`
  // — um round-trip ao banco por mês, em série (até 24 seguidos, já que
  // monthsAhead vai até 24). `addMonths` é puro/síncrono, então dá para
  // montar `months` inteiro antes e disparar as buscas de cartão em
  // paralelo, na mesma ordem (Promise.all preserva a ordem do array).
  const [debtSchedule, recurring, cardSchedule] = await Promise.all([
    getDebtInstallmentSchedule(userId, monthsAhead),
    getActiveRecurringTotals(userId),
    Promise.all(months.map((ref) => getCardInstallmentsForMonth(userId, ref.month, ref.year))),
  ]);

  return { startMonth, months, recurringIncome: recurring.income, fixedExpenses: recurring.fixedExpenses, debtSchedule, cardSchedule };
}

/**
 * Projeção mês a mês a partir de `startMonthId`. `cumulativeNet` é a soma
 * acumulada do saldo líquido projetado a partir de zero — quem chama soma
 * o saldo atual real (já calculado em dashboard.service.js) por cima, se
 * quiser uma trajetória absoluta em vez de relativa.
 */
async function projectMonths(userId, startMonthId, monthsAhead) {
  const components = await getProjectionComponents(userId, startMonthId, monthsAhead);
  return mergeComponentsIntoSeries(components);
}

function mergeComponentsIntoSeries({ months, recurringIncome, fixedExpenses, debtSchedule, cardSchedule }) {
  const results = [];
  let cumulative = 0;

  for (let i = 0; i < months.length; i += 1) {
    const debtInstallments = debtSchedule[i] ?? 0;
    const cardInstallments = cardSchedule[i] ?? 0;
    const totalExpenses = round2(fixedExpenses + debtInstallments + cardInstallments);
    const netProjected = round2(recurringIncome - totalExpenses);
    cumulative = round2(cumulative + netProjected);

    results.push({
      month: months[i].month,
      year: months[i].year,
      projectedIncome: round2(recurringIncome),
      projectedFixedExpenses: round2(fixedExpenses),
      projectedDebtInstallments: round2(debtInstallments),
      projectedCardInstallments: round2(cardInstallments),
      totalExpenses,
      netProjected,
      cumulativeNet: cumulative,
    });
  }

  return results;
}

module.exports = {
  projectMonths,
  getProjectionComponents,
  mergeComponentsIntoSeries,
  getDebtInstallmentSchedule,
  getSingleDebtSchedule,
  getActiveRecurringTotals,
  getCardInstallmentsForMonth,
};

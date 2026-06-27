const prisma = require('../../config/prisma');
const monthsService = require('../months/months.service');
const debtsService = require('../debts/debts.service');
const {
  getProjectionComponents,
  mergeComponentsIntoSeries,
  getSingleDebtSchedule,
} = require('../projections/projections.service');

function round2(v) { return Math.round(v * 100) / 100; }

/**
 * Cenários disponíveis. Cada um recebe os `components` brutos da projeção
 * baseline e os modifica SEM alterar dados reais — só altera os arrays em
 * memória antes de passar para mergeComponentsIntoSeries.
 *
 * `input` para cada tipo:
 *  pay_debt             → { debtId }
 *  anticipate_inst      → { debtId, amount }       (abate extra no saldo devedor)
 *  save_monthly         → { amount }                (reduz net projetado todo mês)
 *  reduce_category      → { amount }                (reduz fixedExpenses)
 *  cancel_subscription  → { amount }                (reduz fixedExpenses)
 *  increase_income      → { amount }                (aumenta recurringIncome)
 */

async function applyScenario(userId, type, input, components) {
  const c = { ...components, debtSchedule: [...components.debtSchedule], cardSchedule: [...components.cardSchedule] };

  switch (type) {
    case 'pay_debt': {
      const debt = await prisma.debt.findFirst({ where: { id: BigInt(input.debtId), userId, status: 'active' } });
      if (!debt) break;
      const debtSched = await getSingleDebtSchedule(debt, c.debtSchedule.length);
      for (let i = 0; i < c.debtSchedule.length; i++) {
        c.debtSchedule[i] = round2(c.debtSchedule[i] - (debtSched[i] ?? 0));
      }
      break;
    }

    case 'anticipate_installments': {
      const debt = await prisma.debt.findFirst({ where: { id: BigInt(input.debtId), userId, status: 'active' } });
      if (!debt) break;
      const newBalance = round2(Math.max(Number(debt.remainingBalance) - Number(input.amount), 0));
      const debtSched = await getSingleDebtSchedule(debt, c.debtSchedule.length);
      const newSched = await getSingleDebtSchedule(debt, c.debtSchedule.length, newBalance);
      for (let i = 0; i < c.debtSchedule.length; i++) {
        c.debtSchedule[i] = round2(c.debtSchedule[i] - (debtSched[i] ?? 0) + (newSched[i] ?? 0));
      }
      break;
    }

    case 'save_monthly':
      // Guardar R$X/mês equivale a uma saída extra todo mês — reduz o net projetado.
      c.fixedExpenses = round2(c.fixedExpenses + Number(input.amount));
      break;

    case 'reduce_category':
    case 'cancel_subscription':
      c.fixedExpenses = round2(Math.max(c.fixedExpenses - Number(input.amount), 0));
      break;

    case 'increase_income':
      c.recurringIncome = round2(c.recurringIncome + Number(input.amount));
      break;
  }

  return c;
}

/**
 * Roda o cenário em memória e compara com o baseline mês a mês.
 * Não persiste nada.
 */
async function runScenarioPreview(userId, monthId, type, input, monthsAhead = 12) {
  await monthsService.getMonthOrThrow(userId, monthId);
  const baseComponents = await getProjectionComponents(userId, monthId, monthsAhead);
  const scenarioComponents = await applyScenario(userId, type, input, baseComponents);

  const baseline = mergeComponentsIntoSeries(baseComponents);
  const scenario = mergeComponentsIntoSeries(scenarioComponents);

  const comparison = baseline.map((b, i) => {
    const s = scenario[i];
    return {
      month: b.month,
      year: b.year,
      baselineNet: b.netProjected,
      scenarioNet: s.netProjected,
      difference: round2(s.netProjected - b.netProjected),
      baselineCumulative: b.cumulativeNet,
      scenarioCumulative: s.cumulativeNet,
      cumulativeDifference: round2(s.cumulativeNet - b.cumulativeNet),
    };
  });

  const totalGain = round2(comparison[comparison.length - 1]?.cumulativeDifference ?? 0);
  const firstPositiveMonth = comparison.find((m) => m.cumulativeDifference > 0);

  return {
    type,
    input,
    monthsAhead,
    totalGain,
    firstPositiveMonth: firstPositiveMonth
      ? { month: firstPositiveMonth.month, year: firstPositiveMonth.year }
      : null,
    comparison,
  };
}

/**
 * Salva o cenário e seus resultados no banco para consulta futura.
 * Os dados financeiros reais NÃO são alterados em nenhum momento.
 */
async function saveSimulation(userId, monthId, { type, name, input, monthsAhead = 12 }) {
  const preview = await runScenarioPreview(userId, monthId, type, input, monthsAhead);

  return prisma.$transaction(async (tx) => {
    const simulation = await tx.simulation.create({
      data: {
        userId,
        type,
        name,
        inputJson: input,
        monthsAhead,
      },
    });

    await tx.simulationResult.createMany({
      data: preview.comparison.map((row, i) => ({
        simulationId: simulation.id,
        monthIndex: i,
        month: row.month,
        year: row.year,
        baselineNet: row.baselineNet,
        scenarioNet: row.scenarioNet,
        difference: row.difference,
      })),
    });

    return { simulation, preview };
  });
}

async function listSimulations(userId) {
  return prisma.simulation.findMany({
    where: { userId },
    include: { results: { orderBy: { monthIndex: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  });
}

async function deleteSimulation(userId, simulationId) {
  const sim = await prisma.simulation.findFirst({ where: { id: simulationId, userId } });
  if (!sim) throw new Error('Simulação não encontrada.');
  await prisma.simulation.delete({ where: { id: simulationId } });
}

module.exports = { runScenarioPreview, saveSimulation, listSimulations, deleteSimulation };

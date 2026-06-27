const monthsService = require('../months/months.service');
const cardsService = require('../cards/cards.service');
const projectionsService = require('../projections/projections.service');
const { getAverageRecentIncome } = require('../_shared/financialMetrics');
const { classifyCommitment } = require('../_shared/commitment');
const AppError = require('../../utils/AppError');

function round2(value) {
  return Math.round(value * 100) / 100;
}

const LOOKAHEAD_MONTHS = 12;
const MAX_INSTALLMENTS_SUGGESTED = 12;

async function simulatePurchase(userId, payload) {
  await monthsService.getMonthOrThrow(userId, payload.monthId);

  const [avgIncome, projection] = await Promise.all([
    getAverageRecentIncome(userId, payload.monthId, 3),
    projectionsService.projectMonths(userId, payload.monthId, LOOKAHEAD_MONTHS),
  ]);

  let cardCheck = null;
  if (payload.cardId) {
    const card = await cardsService.getOwnedCardOrThrow(userId, payload.cardId);
    const usedLimit = await cardsService.computeUsedLimit(card.id);
    const availableLimit = round2(Number(card.limitValue) - usedLimit);
    cardCheck = { cardName: card.name, availableLimit, sufficient: payload.value <= availableLimit + 0.009 };
  }

  const existingCommitment = projection[0]?.totalExpenses ?? 0;

  function ratioFor(installments) {
    const installmentValue = installments <= 1 ? payload.value : round2(payload.value / installments);
    const ratio = avgIncome > 0 ? (existingCommitment + installmentValue) / avgIncome : installmentValue > 0 ? 1 : 0;
    return { installmentValue, ratio };
  }

  const requested = ratioFor(payload.installments);
  const requestedBand = classifyCommitment(requested.ratio);
  let recommended = requestedBand === 'saudavel' || requestedBand === 'atencao';
  if (cardCheck && !cardCheck.sufficient) recommended = false;

  // Melhor parcelamento: menor número de parcelas que ainda mantém a faixa
  // "saudável" — preferindo quitar rápido em vez de esticar ao máximo.
  let bestInstallments = null;
  for (let n = 1; n <= MAX_INSTALLMENTS_SUGGESTED; n += 1) {
    const { ratio } = ratioFor(n);
    if (classifyCommitment(ratio) === 'saudavel') {
      bestInstallments = n;
      break;
    }
  }

  // Se nem parcelando ao máximo cabe com saúde, procura no horizonte de 12
  // meses o primeiro mês em que os compromissos JÁ agendados (sem esta
  // compra) deixam espaço para ela à vista — dados reais de projeção, não
  // achismo.
  let waitUntil = null;
  if (!bestInstallments) {
    for (const month of projection) {
      const ratio = avgIncome > 0 ? (month.totalExpenses + payload.value) / avgIncome : 1;
      if (classifyCommitment(ratio) === 'saudavel') {
        waitUntil = { month: month.month, year: month.year };
        break;
      }
    }
  }

  const annualImpact = round2(Math.min(payload.installments, 12) * requested.installmentValue);

  return {
    description: payload.description,
    value: payload.value,
    installments: payload.installments,
    installmentValue: requested.installmentValue,
    monthlyCommitmentRatio: round2(requested.ratio * 100),
    commitmentBand: requestedBand,
    recommended,
    cardCheck,
    bestInstallments,
    waitUntil,
    monthlyImpact: requested.installmentValue,
    annualImpact,
    explanation: buildExplanation({ recommended, requestedBand, cardCheck, bestInstallments, waitUntil, payload }),
  };
}

function buildExplanation({ recommended, requestedBand, cardCheck, bestInstallments, waitUntil, payload }) {
  if (cardCheck && !cardCheck.sufficient) {
    return `Limite insuficiente no cartão (disponível: ${cardCheck.availableLimit.toFixed(2)}).`;
  }
  if (recommended) {
    return requestedBand === 'saudavel'
      ? 'Pode comprar — o comprometimento da renda fica em faixa saudável.'
      : 'Pode comprar com atenção — o comprometimento fica em faixa de atenção, mas ainda controlado.';
  }
  if (bestInstallments && bestInstallments !== payload.installments) {
    return `Não recomendamos nessa condição. Melhor opção: ${bestInstallments}x de ${round2(payload.value / bestInstallments).toFixed(2)}.`;
  }
  if (waitUntil) {
    const MONTHS = ['', 'janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
    return `Não recomendamos comprar agora. Recomendamos aguardar até ${MONTHS[waitUntil.month]}/${waitUntil.year}.`;
  }
  return 'Não recomendamos comprar neste momento — compromete demais a renda nos próximos meses.';
}

module.exports = { simulatePurchase };

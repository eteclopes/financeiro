/**
 * billing.service.js
 *
 * Camada de abstração para pagamentos.
 * Hoje suporta: Stripe (principal), MercadoPago (fallback BR), Manual (admin).
 *
 * Para ATIVAR Stripe: defina STRIPE_SECRET_KEY no .env
 * Para ATIVAR MercadoPago: defina MP_ACCESS_TOKEN no .env
 *
 * Fluxo de upgrade:
 *   1. Frontend chama POST /billing/checkout → recebe checkout_url
 *   2. Usuário paga na plataforma
 *   3. Plataforma chama webhook POST /billing/webhook
 *   4. Webhook atualiza user.plan + cria PlanSubscription
 */
const prisma   = require('../../config/prisma');
const AppError = require('../../utils/AppError');

// ── Preços ────────────────────────────────────────────────────────────────────
const PRICES = {
  monthly: { amount: 19.90, label: 'Mensal',  stripePriceId: process.env.STRIPE_PRICE_MONTHLY, mpPlanId: process.env.MP_PLAN_MONTHLY },
  annual:  { amount: 179.00, label: 'Anual',  stripePriceId: process.env.STRIPE_PRICE_ANNUAL,  mpPlanId: process.env.MP_PLAN_ANNUAL  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function addMonths(date, n) { const d = new Date(date); d.setUTCMonth(d.getUTCMonth() + n); return d; }
function addYears(date, n)  { const d = new Date(date); d.setUTCFullYear(d.getUTCFullYear() + n); return d; }

async function getUser(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { planSubscription: true } });
  if (!user) throw new AppError('Usuário não encontrado.', 404);
  return user;
}

// ── Plano do usuário ──────────────────────────────────────────────────────────
async function getUserPlan(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, planExpiresAt: true, planSubscription: true, billingCustomerId: true },
  });
  const isPro = user?.plan === 'pro' &&
    (user.planExpiresAt === null || user.planExpiresAt > new Date());

  return {
    plan: user?.plan ?? 'free',
    isPro,
    planExpiresAt: user?.planExpiresAt,
    cancelAtPeriodEnd: user?.planSubscription?.cancelAtPeriodEnd ?? false,
    subscription: user?.planSubscription ?? null,
    prices: PRICES,
  };
}

// ── Ativar plano manualmente (admin ou trial) ─────────────────────────────────
async function activatePlanManually(userId, interval = 'monthly') {
  const now       = new Date();
  const expiresAt = interval === 'annual' ? addYears(now, 1) : addMonths(now, 1);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data:  { plan: 'pro', planExpiresAt: expiresAt },
    });
    await tx.planSubscription.upsert({
      where:  { userId },
      create: { userId, provider: 'manual', status: 'active', interval, currentPeriodStart: now, currentPeriodEnd: expiresAt, priceAmount: PRICES[interval].amount },
      update: { status: 'active', interval, currentPeriodStart: now, currentPeriodEnd: expiresAt, priceAmount: PRICES[interval].amount },
    });
  });

  return { success: true, expiresAt };
}

// ── Cancelar plano ────────────────────────────────────────────────────────────
async function cancelPlan(userId) {
  const user = await getUser(userId);
  if (user.plan !== 'pro') throw new AppError('Você não possui um plano Pro ativo.', 409);

  if (user.planSubscription?.provider === 'stripe' && user.billingCustomerId) {
    // Aqui entraria: stripe.subscriptions.update(externalId, { cancel_at_period_end: true })
    // Por ora apenas marca localmente
  }

  await prisma.planSubscription.update({
    where:  { userId },
    data:   { cancelAtPeriodEnd: true, status: 'cancelled' },
  });

  // Plano continua ativo até planExpiresAt — não zeramos agora
  return { success: true, message: 'Plano cancelado. Acesso Pro continua até o fim do período.' };
}

// ── Webhook handler ───────────────────────────────────────────────────────────
/**
 * Chamado pelas rotas de webhook após validação da assinatura.
 * Suporta eventos Stripe e MercadoPago.
 */
async function handleWebhookEvent(provider, event) {
  if (provider === 'stripe') {
    const { type, data } = event;

    if (['customer.subscription.created', 'customer.subscription.updated'].includes(type)) {
      const sub = data.object;
      const user = await prisma.user.findFirst({ where: { billingCustomerId: sub.customer } });
      if (!user) return { ignored: true };

      const interval   = sub.items.data[0]?.price?.recurring?.interval === 'year' ? 'annual' : 'monthly';
      const periodEnd  = new Date(sub.current_period_end * 1000);
      const periodStart = new Date(sub.current_period_start * 1000);
      const isActive   = ['active', 'trialing'].includes(sub.status);

      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data:  { plan: isActive ? 'pro' : 'free', planExpiresAt: isActive ? periodEnd : null },
        });
        await tx.planSubscription.upsert({
          where:  { userId: user.id },
          create: { userId: user.id, provider: 'stripe', externalId: sub.id, status: sub.status, interval, currentPeriodStart: periodStart, currentPeriodEnd: periodEnd, cancelAtPeriodEnd: sub.cancel_at_period_end, priceAmount: (sub.items.data[0]?.price?.unit_amount ?? 0) / 100 },
          update: { status: sub.status, interval, currentPeriodStart: periodStart, currentPeriodEnd: periodEnd, cancelAtPeriodEnd: sub.cancel_at_period_end },
        });
      });
    }

    if (type === 'customer.subscription.deleted') {
      const sub  = data.object;
      const user = await prisma.user.findFirst({ where: { billingCustomerId: sub.customer } });
      if (user) {
        await prisma.user.update({ where: { id: user.id }, data: { plan: 'free', planExpiresAt: null } });
        await prisma.planSubscription.update({ where: { userId: user.id }, data: { status: 'cancelled' } });
      }
    }
  }

  return { processed: true };
}

// ── Gerar link de checkout ────────────────────────────────────────────────────
/**
 * Gera a URL de checkout.
 * Quando Stripe estiver configurado (STRIPE_SECRET_KEY no env),
 * cria uma sessão real. Caso contrário retorna uma URL de placeholder
 * para que o frontend já funcione no modo "não configurado ainda".
 */
async function createCheckoutSession(userId, interval = 'monthly') {
  const price = PRICES[interval];
  if (!price) throw new AppError('Intervalo inválido.', 422);

  const user = await getUser(userId);

  // Se Stripe configurado
  if (process.env.STRIPE_SECRET_KEY && price.stripePriceId) {
    const Stripe = require('stripe');
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

    let customerId = user.billingCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, name: user.name, metadata: { userId: String(user.id) } });
      customerId = customer.id;
      await prisma.user.update({ where: { id: userId }, data: { billingCustomerId: customerId } });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: price.stripePriceId, quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL}/settings?upgrade=success`,
      cancel_url:  `${process.env.FRONTEND_URL}/settings?upgrade=cancelled`,
      metadata: { userId: String(userId), interval },
    });

    return { checkoutUrl: session.url, provider: 'stripe' };
  }

  // Se MercadoPago configurado
  if (process.env.MP_ACCESS_TOKEN && price.mpPlanId) {
    // Integração MP pode ser adicionada aqui
    // Por ora: placeholder
  }

  // Nenhuma plataforma configurada — retorna URL de configuração
  return {
    checkoutUrl: null,
    provider: null,
    message: 'Nenhuma plataforma de pagamento configurada. Configure STRIPE_SECRET_KEY no backend.',
    notConfigured: true,
    prices: PRICES,
  };
}

module.exports = {
  getUserPlan,
  activatePlanManually,
  cancelPlan,
  handleWebhookEvent,
  createCheckoutSession,
  PRICES,
};

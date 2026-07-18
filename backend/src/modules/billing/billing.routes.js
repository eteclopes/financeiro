const { Router }    = require('express');
const asyncHandler  = require('../../utils/asyncHandler');
const authenticate  = require('../../middlewares/authenticate');
const billingService = require('./billing.service');

const router = Router();

// Rota pública — Stripe e MP enviam webhooks sem autenticação
// A validação da assinatura é feita dentro do handler
router.post('/webhook/stripe', asyncHandler(async (req, res) => {
  const sig    = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (secret) {
    try {
      const Stripe = require('stripe');
      const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
      const event  = stripe.webhooks.constructEvent(req.rawBody, sig, secret);
      await billingService.handleWebhookEvent('stripe', event);
    } catch (err) {
      return res.status(400).json({ error: `Webhook error: ${err.message}` });
    }
  }

  res.json({ received: true });
}));

router.post('/webhook/mercadopago', asyncHandler(async (req, res) => {
  // MercadoPago webhook — implementar validação quando configurar MP
  await billingService.handleWebhookEvent('mercadopago', req.body);
  res.json({ received: true });
}));

// Rotas autenticadas
router.use(authenticate);

// Retorna plano atual + preços
router.get('/plan', asyncHandler(async (req, res) => {
  const plan = await billingService.getUserPlan(req.userId);
  res.json(plan);
}));

// Cria checkout session
router.post('/checkout', asyncHandler(async (req, res) => {
  const { interval = 'monthly' } = req.body;
  const result = await billingService.createCheckoutSession(req.userId, interval);
  res.json(result);
}));

// Cancela assinatura
router.post('/cancel', asyncHandler(async (req, res) => {
  const result = await billingService.cancelPlan(req.userId);
  res.json(result);
}));

// Ativar Pro manualmente (apenas para admin/dev — proteja com chave)
router.post('/admin/activate', asyncHandler(async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_SECRET_KEY) {
    return res.status(403).json({ error: 'Não autorizado.' });
  }
  const { userId, interval } = req.body;
  const result = await billingService.activatePlanManually(BigInt(userId), interval);
  res.json(result);
}));

module.exports = router;

const { Router }    = require('express');
const authenticate  = require('../../middlewares/authenticate');
const validate      = require('../../middlewares/validate');
const controller    = require('./cards.controller');
const prisma        = require('../../config/prisma');
const AppError      = require('../../utils/AppError');
const asyncHandler  = require('../../utils/asyncHandler');
const requirePro    = require('../../middlewares/requirePro');
const {
  createCardSchema, updateCardSchema, createCardPurchaseSchema, payInvoiceSchema,
} = require('./cards.validators');

const router = Router();
router.use(authenticate);

router.get('/', controller.listCards);

/**
 * LIMITE PLANO FREE: máximo 2 cartões ativos.
 * Usuário Pro: ilimitado.
 */
router.post('/', validate(createCardSchema), asyncHandler(async (req, res, next) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { plan: true, planExpiresAt: true } });
  const isPro = user?.plan === 'pro' && (!user.planExpiresAt || user.planExpiresAt > new Date());

  if (!isPro) {
    const count = await prisma.card.count({ where: { userId: req.userId, active: true } });
    if (count >= 2) {
      return next(new AppError(
        'O plano gratuito permite até 2 cartões. Faça upgrade para o Plano Pro e cadastre cartões ilimitados.',
        403,
        'PLAN_LIMIT_CARDS'
      ));
    }
  }
  return controller.createCard(req, res, next);
}));

router.patch('/:id', validate(updateCardSchema), controller.updateCard);
router.patch('/:id/deactivate', controller.deactivateCard);
router.delete('/:id', controller.deleteCard);

router.post('/:id/purchases', validate(createCardPurchaseSchema), controller.createPurchase);

router.get('/:id/invoices', controller.listInvoices);
router.post('/invoices/:invoiceId/pay', validate(payInvoiceSchema), controller.payInvoice);

module.exports = router;

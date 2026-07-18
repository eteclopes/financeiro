const { Router } = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const authenticate = require('../../middlewares/authenticate');
const validate = require('../../middlewares/validate');
const subscriptionsService = require('./subscriptions.service');
const { createSubscriptionSchema, updateSubscriptionSchema } = require('./subscriptions.validators');

const router = Router();
router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const subs = await subscriptionsService.listSubscriptions(req.userId);
  res.json({ subscriptions: subs });
}));

router.post('/', validate(createSubscriptionSchema), asyncHandler(async (req, res) => {
  const sub = await subscriptionsService.createSubscription(req.userId, req.body);
  res.status(201).json({ subscription: sub });
}));

router.patch('/:id', validate(updateSubscriptionSchema), asyncHandler(async (req, res) => {
  const sub = await subscriptionsService.updateSubscription(req.userId, BigInt(req.params.id), req.body);
  res.json({ subscription: sub });
}));

router.patch('/:id/pause', asyncHandler(async (req, res) => {
  const sub = await subscriptionsService.pauseSubscription(req.userId, BigInt(req.params.id));
  res.json({ subscription: sub });
}));

router.post('/:id/cancel', asyncHandler(async (req, res) => {
  const sub = await subscriptionsService.cancelSubscription(req.userId, BigInt(req.params.id));
  res.json({ subscription: sub });
}));

module.exports = router;

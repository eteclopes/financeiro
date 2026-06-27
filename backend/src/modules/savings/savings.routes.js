const { Router } = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const authenticate = require('../../middlewares/authenticate');
const validate = require('../../middlewares/validate');
const service = require('./savings.service');
const { savingsMovementSchema } = require('./savings.validators');

const router = Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [balance, transactions] = await Promise.all([
      service.getCurrentBalance(req.userId),
      service.listTransactions(req.userId),
    ]);
    res.json({ balance, transactions });
  })
);

router.post(
  '/deposit',
  validate(savingsMovementSchema),
  asyncHandler(async (req, res) => {
    const transaction = await service.deposit(req.userId, req.body);
    res.status(201).json({ transaction });
  })
);

router.post(
  '/withdraw',
  validate(savingsMovementSchema),
  asyncHandler(async (req, res) => {
    const transaction = await service.withdraw(req.userId, req.body);
    res.status(201).json({ transaction });
  })
);

module.exports = router;

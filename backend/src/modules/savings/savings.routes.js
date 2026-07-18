const { Router } = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const authenticate = require('../../middlewares/authenticate');
const validate = require('../../middlewares/validate');
const service = require('./savings.service');
const { savingsMovementSchema, savingsDepositSchema } = require('./savings.validators');

const router = Router();
router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const [balance, transactions, stats] = await Promise.all([
    service.getCurrentBalance(req.userId),
    service.listTransactions(req.userId),
    service.getSavingsStats(req.userId),
  ]);
  res.json({ balance, transactions, stats });
}));

router.post('/deposit', validate(savingsDepositSchema), asyncHandler(async (req, res) => {
  const transaction = await service.deposit(req.userId, req.body);
  res.status(201).json({ transaction });
}));

router.post('/withdraw', validate(savingsMovementSchema), asyncHandler(async (req, res) => {
  const transaction = await service.withdraw(req.userId, req.body);
  res.status(201).json({ transaction });
}));

router.patch('/:id', validate(savingsMovementSchema), asyncHandler(async (req, res) => {
  const transaction = await service.updateLastTransaction(req.userId, BigInt(req.params.id), req.body);
  res.json({ transaction });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const transaction = await service.deleteLastTransaction(req.userId, BigInt(req.params.id));
  res.json({ transaction });
}));

module.exports = router;

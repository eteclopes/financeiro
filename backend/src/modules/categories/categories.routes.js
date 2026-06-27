const { Router } = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const authenticate = require('../../middlewares/authenticate');
const validate = require('../../middlewares/validate');
const AppError = require('../../utils/AppError');
const service = require('./categories.service');
const { createCategorySchema } = require('./categories.validators');

const router = Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { type } = req.query;
    if (type !== 'income' && type !== 'expense') {
      throw new AppError('Parâmetro "type" deve ser "income" ou "expense".', 422, 'VALIDATION_ERROR');
    }
    const categories = await service.listCategories(req.userId, type);
    res.json({ categories });
  })
);

router.post(
  '/',
  validate(createCategorySchema),
  asyncHandler(async (req, res) => {
    const category = await service.createCategory(req.userId, req.body);
    res.status(201).json({ category });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await service.deleteCategory(req.userId, BigInt(req.params.id));
    res.status(204).send();
  })
);

module.exports = router;

const { Router } = require('express');
const authenticate = require('../../middlewares/authenticate');
const validate = require('../../middlewares/validate');
const controller = require('./expenses.controller');
const {
  createVariableExpenseSchema,
  createFixedExpenseSchema,
  updateFixedTemplateSchema,
  updateExpenseSchema,
  payExpenseSchema,
} = require('./expenses.validators');

const router = Router();
router.use(authenticate);

// Listagem
router.get('/', controller.list);

// Criação
router.post('/variable', validate(createVariableExpenseSchema), controller.createVariable);
router.post('/fixed', validate(createFixedExpenseSchema), controller.createFixed);

// Rotas específicas de templates (ANTES de /:id para não conflitar)
router.patch('/fixed/templates/:id/deactivate', controller.deactivateFixedTemplate);
router.patch('/fixed/templates/:id', validate(updateFixedTemplateSchema), controller.updateFixedTemplate);
router.delete('/fixed/templates/:id', controller.deleteFixedTemplate);

// Rotas genéricas por ID de instância
router.patch('/:id', validate(updateExpenseSchema), controller.update);
router.delete('/:id', controller.remove);
router.post('/:id/pay', validate(payExpenseSchema), controller.pay);

module.exports = router;

const { z } = require('zod');

const savingsMovementSchema = z.object({
  value: z.coerce.number().positive('Valor deve ser maior que zero.'),
  date: z.coerce.date(),
  observation: z.string().trim().max(255).optional(),
});

// Schema para depósito com campo de origem (Item 6)
const savingsDepositSchema = z.object({
  value: z.coerce.number().positive('Valor deve ser maior que zero.'),
  date: z.coerce.date(),
  observation: z.string().trim().max(255).optional(),
  origin: z.enum(['from_balance', 'external']).default('from_balance'),
});

module.exports = { savingsMovementSchema, savingsDepositSchema };

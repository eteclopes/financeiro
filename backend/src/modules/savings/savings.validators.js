const { z } = require('zod');

const savingsMovementSchema = z.object({
  value: z.coerce.number().positive('Valor deve ser maior que zero.'),
  date: z.coerce.date(),
  observation: z.string().trim().max(255).optional(),
});

module.exports = { savingsMovementSchema };

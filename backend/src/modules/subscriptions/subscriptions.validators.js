const { z } = require('zod');

const createSubscriptionSchema = z.object({
  description: z.string().min(1).max(160),
  value: z.number().positive(),
  categoryId: z.coerce.bigint().positive(),
  paymentMethod: z.enum(['cash', 'pix', 'debit', 'credit', 'transfer']).default('credit'),
  cardId: z.coerce.bigint().positive().optional().nullable(),
  periodicity: z.enum(['monthly', 'annual', 'custom']).default('monthly'),
  customDays: z.number().int().positive().optional().nullable(),
  nextChargeDate: z.string().refine(v => !isNaN(Date.parse(v)), { message: 'Data inválida' }),
  endDate: z.string().refine(v => !v || !isNaN(Date.parse(v)), { message: 'Data inválida' }).optional().nullable(),
});

const updateSubscriptionSchema = createSubscriptionSchema.partial();

module.exports = { createSubscriptionSchema, updateSubscriptionSchema };

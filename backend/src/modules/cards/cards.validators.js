const { z } = require('zod');

const createCardSchema = z.object({
  name: z.string().trim().min(1, 'Nome é obrigatório.').max(80),
  color: z.string().trim().min(1).max(20).default('#6366F1'),
  limitValue: z.coerce.number().positive('Limite deve ser maior que zero.'),
  closingDay: z.coerce.number().int().min(1).max(31),
  dueDay: z.coerce.number().int().min(1).max(31),
});

const updateCardSchema = createCardSchema.partial();

const createCardPurchaseSchema = z.object({
  description: z.string().trim().min(1, 'Descrição é obrigatória.').max(160),
  categoryId: z.coerce.bigint(),
  totalValue: z.coerce.number().positive('Valor deve ser maior que zero.'),
  installmentsCount: z.coerce.number().int().min(1).max(48).default(1),
  purchaseDate: z.coerce.date(),
});

const payInvoiceSchema = z.object({
  paymentMethod: z.enum(['cash', 'pix', 'debit', 'credit', 'transfer']),
});

module.exports = {
  createCardSchema,
  updateCardSchema,
  createCardPurchaseSchema,
  payInvoiceSchema,
};

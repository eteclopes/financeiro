const { z } = require('zod');

const createDebtSchema = z.object({
  monthId: z.coerce.bigint(),
  description: z.string().trim().min(1, 'Descrição é obrigatória.').max(160),
  categoryId: z.coerce.bigint(),
  totalValue: z.coerce.number().positive('Valor total deve ser maior que zero.'),
  installmentsCount: z.coerce.number().int().min(1, 'Mínimo de 1 parcela.').max(360),
  flexiblePayment: z.boolean().default(false),
  dueDay: z.coerce.number().int().min(1).max(31),
});

// Não inclui totalValue/installmentsCount: mudar esses dois depois que a
// dívida já existe exigiria recalcular installmentValue/remainingBalance e
// potencialmente reescrever parcelas já geradas — para isso, quite/exclua a
// dívida atual e crie uma nova.
const updateDebtSchema = z.object({
  description: z.string().trim().min(1, 'Descrição é obrigatória.').max(160).optional(),
  categoryId: z.coerce.bigint().optional(),
  flexiblePayment: z.boolean().optional(),
  dueDay: z.coerce.number().int().min(1).max(31).optional(),
});

module.exports = { createDebtSchema, updateDebtSchema };
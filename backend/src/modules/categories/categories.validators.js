const { z } = require('zod');

const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'Nome é obrigatório.').max(80),
  type: z.enum(['income', 'expense']),
});

module.exports = { createCategorySchema };

const { z } = require('zod');

// Senha "forte" mínima: 8+ caracteres, ao menos uma letra e um número.
// Evita o clássico "123456" sem exigir símbolos (que prejudica usabilidade
// sem ganho real de segurança proporcional, segundo guidelines do NIST).
const passwordSchema = z
  .string()
  .min(8, 'A senha deve ter pelo menos 8 caracteres.')
  .regex(/[A-Za-z]/, 'A senha deve conter ao menos uma letra.')
  .regex(/[0-9]/, 'A senha deve conter ao menos um número.');

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Nome muito curto.').max(120),
  email: z.string().trim().toLowerCase().email('E-mail inválido.'),
  password: passwordSchema,
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail inválido.'),
  password: z.string().min(1, 'Senha é obrigatória.'),
});

const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail inválido.'),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token é obrigatório.'),
  password: passwordSchema,
});

module.exports = {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
};

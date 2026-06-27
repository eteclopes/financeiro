const { z } = require('zod');
require('dotenv').config();

// Falhar rápido na inicialização caso falte alguma variável crítica —
// é preferível o servidor não subir a subir mal configurado em produção.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3333),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  CORS_ORIGIN: z.string().min(1, 'CORS_ORIGIN é obrigatória'),
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET deve ter pelo menos 16 caracteres'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN_DAYS: z.coerce.number().default(30),
  PASSWORD_RESET_EXPIRES_IN_HOURS: z.coerce.number().default(1),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Variáveis de ambiente inválidas:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

module.exports = parsed.data;

const AppError = require('../utils/AppError');
const prisma   = require('../config/prisma');

/**
 * Middleware que bloqueia o acesso se o usuário não for Pro.
 * Deve ser usado APÓS o middleware `authenticate`.
 *
 * Verifica:
 * 1. user.plan === 'pro'
 * 2. Se plan_expires_at existir, deve ser no futuro
 *
 * Uso nas rotas:
 *   router.post('/simulate', authenticate, requirePro, handler)
 */
async function requirePro(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { plan: true, planExpiresAt: true },
    });

    if (!user) return next(new AppError('Usuário não encontrado.', 404));

    const isPro = user.plan === 'pro' &&
      (user.planExpiresAt === null || user.planExpiresAt > new Date());

    if (!isPro) {
      return next(new AppError(
        'Esta funcionalidade é exclusiva do Plano Pro. Faça upgrade para continuar.',
        403,
        'PLAN_REQUIRED'
      ));
    }

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = requirePro;

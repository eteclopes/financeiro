const prisma = require('../../config/prisma');

/**
 * Analytics próprio — complementa o Google Analytics.
 * Registra page views no banco para dashboards internos de admin.
 * Dados: total de visitas, usuários únicos, páginas mais acessadas, retenção.
 */

async function trackPageView({ path, userId, sessionId, referrer, userAgent, country }) {
  // Fire-and-forget — nunca deixar erro de analytics quebrar a requisição
  prisma.pageView.create({
    data: {
      path:      path?.slice(0, 255) ?? '/',
      userId:    userId ?? null,
      sessionId: sessionId?.slice(0, 100) ?? null,
      referrer:  referrer?.slice(0, 500) ?? null,
      userAgent: userAgent?.slice(0, 500) ?? null,
      country:   country?.slice(0, 2) ?? null,
    },
  }).catch(() => {});
}

async function getSummary({ days = 30 } = {}) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [total, unique, topPages, daily, totalUsers, proUsers] = await Promise.all([
    // Total de page views no período
    prisma.pageView.count({ where: { createdAt: { gte: since } } }),

    // Sessões únicas
    prisma.pageView.groupBy({ by: ['sessionId'], where: { createdAt: { gte: since }, sessionId: { not: null } }, _count: true }).then(r => r.length),

    // Top 10 páginas
    prisma.pageView.groupBy({
      by: ['path'],
      where: { createdAt: { gte: since } },
      _count: { path: true },
      orderBy: { _count: { path: 'desc' } },
      take: 10,
    }),

    // Visitas por dia (últimos N dias)
    prisma.$queryRaw`
      SELECT DATE_TRUNC('day', created_at) AS day, COUNT(*) AS views
      FROM page_views
      WHERE created_at >= ${since}
      GROUP BY day
      ORDER BY day ASC
    `,

    // Total de usuários cadastrados
    prisma.user.count(),

    // Usuários Pro ativos
    prisma.user.count({ where: { plan: 'pro', OR: [{ planExpiresAt: null }, { planExpiresAt: { gt: new Date() } }] } }),
  ]);

  return {
    period: { days, since },
    pageViews: {
      total,
      uniqueSessions: unique,
      topPages: topPages.map(p => ({ path: p.path, views: p._count.path })),
      daily: daily.map(d => ({ day: d.day, views: Number(d.views) })),
    },
    users: {
      total: totalUsers,
      pro:   proUsers,
      free:  totalUsers - proUsers,
      conversionRate: totalUsers > 0 ? ((proUsers / totalUsers) * 100).toFixed(1) : '0.0',
    },
  };
}

module.exports = { trackPageView, getSummary };

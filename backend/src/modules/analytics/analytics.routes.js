const { Router }        = require('express');
const asyncHandler      = require('../../utils/asyncHandler');
const authenticate      = require('../../middlewares/authenticate');
const analyticsService  = require('./analytics.service');

const router = Router();

// Rastrear page view (chamado pelo frontend via beacon — fire-and-forget)
router.post('/track', asyncHandler(async (req, res) => {
  const { path, sessionId, referrer } = req.body;
  const userAgent = req.headers['user-agent'];
  const country   = req.headers['cf-ipcountry'] ?? null; // Cloudflare

  // userId pode vir do token se autenticado — opcional
  let userId = null;
  try {
    const jwt = require('jsonwebtoken');
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      userId = BigInt(decoded.sub);
    }
  } catch {}

  analyticsService.trackPageView({ path, userId, sessionId, referrer, userAgent, country });
  res.status(204).end();
}));

// Dashboard de analytics — apenas admin
router.get('/summary', authenticate, asyncHandler(async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_SECRET_KEY) {
    return res.status(403).json({ error: 'Não autorizado.' });
  }
  const days    = parseInt(req.query.days ?? '30');
  const summary = await analyticsService.getSummary({ days });
  res.json(summary);
}));

module.exports = router;

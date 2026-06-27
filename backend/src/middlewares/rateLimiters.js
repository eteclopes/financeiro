const rateLimit = require('express-rate-limit');

// Login e recuperação de senha são os alvos clássicos de força bruta /
// enumeração de e-mail — limitamos por IP de forma mais agressiva que
// o restante da API.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Muitas tentativas. Tente novamente mais tarde.' } },
});

module.exports = { authLimiter };

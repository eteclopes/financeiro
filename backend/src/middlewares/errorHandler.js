const env = require('../config/env');
const AppError = require('../utils/AppError');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
  }

  // Erro não previsto: nunca vaza detalhe interno/stack para o cliente,
  // mas loga completo no servidor para investigação.
  console.error('[unhandled error]', err);

  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Erro interno do servidor.',
      ...(env.NODE_ENV !== 'production' ? { detail: err.message } : {}),
    },
  });
}

module.exports = errorHandler;

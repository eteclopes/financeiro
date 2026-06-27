require('./utils/bigintJson');

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

const env = require('./config/env');
const routes = require('./routes');
const errorHandler = require('./middlewares/errorHandler');
const AppError = require('./utils/AppError');

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true, // necessário para o cookie httpOnly do refresh token
  })
);
app.use(express.json());
app.use(cookieParser());

if (env.NODE_ENV !== 'test') {
  app.use(morgan(env.NODE_ENV === 'development' ? 'dev' : 'combined'));
}

app.use('/api', routes);

app.use((req, res, next) => {
  next(new AppError(`Rota não encontrada: ${req.method} ${req.originalUrl}`, 404, 'NOT_FOUND'));
});

app.use(errorHandler);

module.exports = app;

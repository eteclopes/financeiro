const bcrypt = require('bcryptjs');
const prisma = require('../../config/prisma');
const env = require('../../config/env');
const AppError = require('../../utils/AppError');
const {
  hashToken,
  generateOpaqueToken,
  signAccessToken,
  refreshTokenExpiryDate,
  passwordResetExpiryDate,
} = require('../../utils/tokens');

const BCRYPT_ROUNDS = 12;

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt };
}

async function issueSession(userId) {
  const accessToken = signAccessToken(userId);
  const rawRefreshToken = generateOpaqueToken();

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(rawRefreshToken),
      expiresAt: refreshTokenExpiryDate(),
    },
  });

  return { accessToken, refreshToken: rawRefreshToken };
}

async function register({ name, email, password }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Mensagem deliberadamente específica aqui (diferente do login): no
    // cadastro, "e-mail já em uso" é informação que o formulário já expõe
    // de qualquer forma via UX, então não há ganho de segurança em omitir.
    throw new AppError('Este e-mail já está cadastrado.', 409, 'EMAIL_IN_USE');
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const user = await prisma.user.create({
    data: { name, email, passwordHash },
  });

  const session = await issueSession(user.id);
  return { user: publicUser(user), ...session };
}

async function login({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });

  // Mesma mensagem genérica tanto para "usuário não existe" quanto para
  // "senha errada" — evita enumeração de e-mails cadastrados via login.
  const invalidCredentialsError = new AppError('E-mail ou senha inválidos.', 401, 'INVALID_CREDENTIALS');

  if (!user) {
    throw invalidCredentialsError;
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    throw invalidCredentialsError;
  }

  const session = await issueSession(user.id);
  return { user: publicUser(user), ...session };
}

async function refresh(rawRefreshToken) {
  if (!rawRefreshToken) {
    throw new AppError('Refresh token ausente.', 401, 'UNAUTHORIZED');
  }

  const tokenHash = hashToken(rawRefreshToken);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  const isInvalid =
    !existing || existing.revokedAt !== null || existing.expiresAt.getTime() < Date.now();

  if (isInvalid) {
    throw new AppError('Sessão expirada ou inválida. Faça login novamente.', 401, 'UNAUTHORIZED');
  }

  // Rotação: o token usado é revogado e um novo é emitido a cada refresh.
  // Isso limita a janela de uso de um refresh token roubado a uma única chamada.
  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });

  const session = await issueSession(existing.userId);
  return session;
}

async function logout(rawRefreshToken) {
  if (!rawRefreshToken) return;

  const tokenHash = hashToken(rawRefreshToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

async function forgotPassword(email) {
  const user = await prisma.user.findUnique({ where: { email } });

  // Resposta sempre "sucesso" independentemente de o e-mail existir —
  // do contrário esta rota vira um oráculo de enumeração de contas.
  if (!user) {
    return { devToken: null };
  }

  const rawToken = generateOpaqueToken();
  await prisma.passwordReset.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: passwordResetExpiryDate(),
    },
  });

  // TODO(integração de e-mail): aqui deve disparar um e-mail real com o link
  // de reset. Como nenhum provedor de e-mail foi configurado ainda, em
  // desenvolvimento devolvemos o token bruto na resposta para permitir testar
  // o fluxo ponta a ponta. Isso é removido automaticamente em produção.
  return { devToken: env.NODE_ENV !== 'production' ? rawToken : null };
}

async function resetPassword({ token, password }) {
  const tokenHash = hashToken(token);
  const resetRecord = await prisma.passwordReset.findUnique({ where: { tokenHash } });

  const isInvalid =
    !resetRecord ||
    resetRecord.usedAt !== null ||
    resetRecord.expiresAt.getTime() < Date.now();

  if (isInvalid) {
    throw new AppError('Token de redefinição inválido ou expirado.', 400, 'INVALID_RESET_TOKEN');
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetRecord.userId },
      data: { passwordHash },
    }),
    prisma.passwordReset.update({
      where: { id: resetRecord.id },
      data: { usedAt: new Date() },
    }),
    // Trocar a senha invalida todas as sessões existentes — se a senha
    // vazou, qualquer sessão aberta também deve ser considerada suspeita.
    prisma.refreshToken.updateMany({
      where: { userId: resetRecord.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}

async function me(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError('Usuário não encontrado.', 404, 'USER_NOT_FOUND');
  }
  return publicUser(user);
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  me,
};

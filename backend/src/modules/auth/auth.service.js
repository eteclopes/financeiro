const bcrypt = require('bcryptjs');
const prisma = require('../../config/prisma');
const env = require('../../config/env');
const AppError = require('../../utils/AppError');
const {
  hashToken, generateOpaqueToken, signAccessToken,
  refreshTokenExpiryDate, passwordResetExpiryDate,
} = require('../../utils/tokens');

const BCRYPT_ROUNDS = 12;

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt };
}

function pruneExpiredTokens() {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  prisma.refreshToken.deleteMany({
    where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: cutoff } }] },
  }).catch(() => {});
}

function pruneExpiredPasswordResets() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  prisma.passwordReset.deleteMany({
    where: { OR: [{ expiresAt: { lt: new Date() } }, { usedAt: { lt: cutoff } }] },
  }).catch(() => {});
}

async function issueSession(userId) {
  const accessToken = signAccessToken(userId);
  const rawRefreshToken = generateOpaqueToken();
  await prisma.refreshToken.create({
    data: { userId, tokenHash: hashToken(rawRefreshToken), expiresAt: refreshTokenExpiryDate() },
  });
  if (Math.random() < 0.02) { pruneExpiredTokens(); pruneExpiredPasswordResets(); }
  return { accessToken, refreshToken: rawRefreshToken };
}

async function register({ name, email, password }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AppError('Este e-mail já está cadastrado.', 409, 'EMAIL_IN_USE');
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await prisma.user.create({ data: { name, email, passwordHash } });
  const session = await issueSession(user.id);
  return { user: publicUser(user), ...session };
}

async function login({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });
  const err = new AppError('E-mail ou senha inválidos.', 401, 'INVALID_CREDENTIALS');
  if (!user) throw err;
  if (!await bcrypt.compare(password, user.passwordHash)) throw err;
  const session = await issueSession(user.id);
  return { user: publicUser(user), ...session };
}

async function refresh(rawRefreshToken) {
  if (!rawRefreshToken) throw new AppError('Refresh token ausente.', 401, 'UNAUTHORIZED');
  const tokenHash = hashToken(rawRefreshToken);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!existing || existing.revokedAt !== null || existing.expiresAt.getTime() < Date.now()) {
    throw new AppError('Sessão expirada ou inválida. Faça login novamente.', 401, 'UNAUTHORIZED');
  }
  await prisma.refreshToken.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });
  return issueSession(existing.userId);
}

async function logout(rawRefreshToken) {
  if (!rawRefreshToken) return;
  const tokenHash = hashToken(rawRefreshToken);
  await prisma.refreshToken.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() } });
}

async function forgotPassword(email) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return { devToken: null };
  const rawToken = generateOpaqueToken();
  await prisma.passwordReset.create({
    data: { userId: user.id, tokenHash: hashToken(rawToken), expiresAt: passwordResetExpiryDate() },
  });
  // TODO: disparar e-mail real aqui (Resend, SendGrid, Amazon SES)
  // SÓ retorna token em development explícito — nunca em production/undefined
  const devToken = env.NODE_ENV === 'development' ? rawToken : null;
  return { devToken };
}

async function resetPassword({ token, password }) {
  const tokenHash = hashToken(token);
  const rec = await prisma.passwordReset.findUnique({ where: { tokenHash } });
  if (!rec || rec.usedAt !== null || rec.expiresAt.getTime() < Date.now()) {
    throw new AppError('Token de redefinição inválido ou expirado.', 400, 'INVALID_RESET_TOKEN');
  }
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await prisma.$transaction([
    prisma.user.update({ where: { id: rec.userId }, data: { passwordHash } }),
    prisma.passwordReset.update({ where: { id: rec.id }, data: { usedAt: new Date() } }),
    prisma.refreshToken.updateMany({ where: { userId: rec.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
}

async function me(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('Usuário não encontrado.', 404, 'USER_NOT_FOUND');
  return publicUser(user);
}

module.exports = { register, login, refresh, logout, forgotPassword, resetPassword, me };
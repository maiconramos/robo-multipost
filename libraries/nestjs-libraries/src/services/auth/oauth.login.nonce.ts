import { createHash } from 'crypto';

// Login social (GITHUB/GOOGLE/GENERIC) preso ao navegador que o iniciou: o
// nonce vai num cookie httpOnly no GET /auth/oauth/:provider e e exigido na
// troca do code (POST /auth/oauth/:provider/exists).
export const OAUTH_LOGIN_COOKIE = 'oauth_login';
export const OAUTH_LOGIN_NONCE_TTL = 15 * 60;

export const oauthLoginNonceKey = (nonce: string) =>
  `oauth-login-nonce:${createHash('sha256').update(nonce).digest('hex')}`;

import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';

const ACCESS_TTL = '15m';
const REFRESH_TTL = '7d';

export const ACCESS_COOKIE = 'accessToken';
export const REFRESH_COOKIE = 'refreshToken';
export const ACCESS_MAX_AGE_MS = 15 * 60 * 1000;
export const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type AccessClaims = {
  sub: string;
  role: string;
  type: 'access';
};

type RefreshClaims = {
  sub: string;
  tokenVersion: number;
  type: 'refresh';
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function signAccessToken(user: { id: string; role: string }): string {
  return jwt.sign({ sub: user.id, role: user.role, type: 'access' }, env.JWT_ACCESS_SECRET, {
    expiresIn: ACCESS_TTL,
    algorithm: 'HS256',
  });
}

export function signRefreshToken(user: { id: string; tokenVersion: number }): string {
  return jwt.sign(
    { sub: user.id, tokenVersion: user.tokenVersion, type: 'refresh' },
    env.JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TTL, algorithm: 'HS256' },
  );
}

export function readAccessToken(token: string): AccessClaims {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
    if (
      !isRecord(payload) ||
      payload['type'] !== 'access' ||
      typeof payload['sub'] !== 'string' ||
      typeof payload['role'] !== 'string'
    ) {
      throw ApiError.unauthorized();
    }
    return { sub: payload['sub'], role: payload['role'], type: 'access' };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw ApiError.unauthorized();
  }
}

export function readRefreshToken(token: string): RefreshClaims {
  try {
    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: ['HS256'] });
    if (
      !isRecord(payload) ||
      payload['type'] !== 'refresh' ||
      typeof payload['sub'] !== 'string' ||
      typeof payload['tokenVersion'] !== 'number'
    ) {
      throw ApiError.unauthorized();
    }
    return {
      sub: payload['sub'],
      tokenVersion: payload['tokenVersion'],
      type: 'refresh',
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw ApiError.unauthorized();
  }
}

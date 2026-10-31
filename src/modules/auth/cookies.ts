import type { Response } from 'express';
import { env } from '../../config/env.js';
import { ACCESS_COOKIE, ACCESS_MAX_AGE_MS, REFRESH_COOKIE, REFRESH_MAX_AGE_MS } from './tokens.js';

function baseOptions() {
  return {
    httpOnly: env.cookies.httpOnly,
    secure: env.cookies.secure,
    sameSite: env.cookies.sameSite,
    path: '/',
  } as const;
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  const options = baseOptions();
  res.cookie(ACCESS_COOKIE, accessToken, { ...options, maxAge: ACCESS_MAX_AGE_MS });
  res.cookie(REFRESH_COOKIE, refreshToken, { ...options, maxAge: REFRESH_MAX_AGE_MS });
}

export function setAccessCookie(res: Response, accessToken: string): void {
  res.cookie(ACCESS_COOKIE, accessToken, { ...baseOptions(), maxAge: ACCESS_MAX_AGE_MS });
}

export function clearAuthCookies(res: Response): void {
  const options = baseOptions();
  res.clearCookie(ACCESS_COOKIE, options);
  res.clearCookie(REFRESH_COOKIE, options);
}

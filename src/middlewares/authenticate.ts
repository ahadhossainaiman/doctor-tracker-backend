import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/ApiError.js';
import { ACCESS_COOKIE, readAccessToken } from '../modules/auth/tokens.js';

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[ACCESS_COOKIE];
  if (typeof token !== 'string' || token.length === 0) {
    next(ApiError.unauthorized());
    return;
  }

  try {
    const claims = readAccessToken(token);
    req.user = { id: claims.sub, role: claims.role };
    next();
  } catch (error) {
    next(error);
  }
}

export function authorize(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(ApiError.unauthorized());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(ApiError.forbidden());
      return;
    }
    next();
  };
}

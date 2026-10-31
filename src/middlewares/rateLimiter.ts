import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { ApiError } from '../utils/ApiError.js';

/** Five failed logins per 15 minutes for the same IP and email. */
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator(req) {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    return `${ipKeyGenerator(req.ip ?? '')}:${email}`;
  },
  handler(_req, _res, next) {
    next(ApiError.tooManyRequests('Too many login attempts. Try again later.'));
  },
});

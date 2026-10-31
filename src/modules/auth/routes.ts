import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/authenticate.js';
import { loginRateLimit } from '../../middlewares/rateLimiter.js';
import { validate } from '../../middlewares/validate.js';
import * as authController from './controller.js';
import { loginSchema } from './schema.js';

export const authRouter = Router();

authRouter.post('/login', loginRateLimit, validate(loginSchema), authController.login);
authRouter.post('/refresh', authController.refresh);
authRouter.post('/logout', authController.logout);
authRouter.get('/me', authenticate, authorize('admin'), authController.me);

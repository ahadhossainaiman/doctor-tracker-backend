import type { Request, Response } from 'express';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/response.js';
import { loginSchema } from './schema.js';
import * as authService from './service.js';

export const login = asyncHandler(async (req: Request, res: Response) => {
  const input = loginSchema.parse(req.body);
  const user = await authService.login(input, res);
  sendSuccess(res, user);
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.refresh(req, res);
  sendSuccess(res, user);
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.logout(req, res);
  sendSuccess(res, result);
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    throw ApiError.unauthorized();
  }
  sendSuccess(res, await authService.me(userId));
});

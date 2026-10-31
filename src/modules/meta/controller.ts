import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/response.js';
import * as metaService from './service.js';

export const filters = asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, await metaService.getFilters());
});

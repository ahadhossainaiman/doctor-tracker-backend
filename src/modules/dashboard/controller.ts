import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/response.js';
import { conditionsSchema, patientsPerDoctorSchema, timeseriesSchema } from './schema.js';
import * as dashboardService from './service.js';

export const summary = asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, await dashboardService.getSummary());
});

export const patientsPerDoctor = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(
    res,
    await dashboardService.patientsPerDoctor(patientsPerDoctorSchema.parse(req.query)),
  );
});

export const timeseries = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await dashboardService.timeseries(timeseriesSchema.parse(req.query)));
});

export const conditions = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await dashboardService.conditions(conditionsSchema.parse(req.query)));
});

export const specializations = asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, await dashboardService.specializations());
});

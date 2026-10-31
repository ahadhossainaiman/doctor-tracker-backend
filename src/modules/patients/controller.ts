import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { idParamSchema } from '../../utils/objectId.js';
import { sendSuccess } from '../../utils/response.js';
import { patientListSchema, updatePatientSchema } from './schema.js';
import * as patientService from './service.js';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await patientService.listPatients(patientListSchema.parse(req.query));
  sendSuccess(res, result.items, result.meta);
});

export const detail = asyncHandler(async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  sendSuccess(res, await patientService.getPatient(id));
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  sendSuccess(res, await patientService.updatePatient(id, updatePatientSchema.parse(req.body)));
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  sendSuccess(res, await patientService.deletePatient(id));
});

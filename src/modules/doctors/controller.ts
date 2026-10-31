import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { doctorPatientParamSchema, idParamSchema } from '../../utils/objectId.js';
import { sendSuccess } from '../../utils/response.js';
import * as patientService from '../patients/service.js';
import { createPatientSchema } from '../patients/schema.js';
import {
  createDoctorSchema,
  doctorListSchema,
  doctorPatientsQuerySchema,
  updateDoctorSchema,
} from './schema.js';
import * as doctorService from './service.js';

export const create = asyncHandler(async (req: Request, res: Response) => {
  const doctor = await doctorService.createDoctor(createDoctorSchema.parse(req.body));
  sendSuccess(res, doctor, undefined, 201);
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = doctorListSchema.parse(req.query);
  const result = await doctorService.listDoctors(query);
  sendSuccess(res, result.items, result.meta);
});

export const detail = asyncHandler(async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  sendSuccess(res, await doctorService.getDoctor(id));
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const doctor = await doctorService.updateDoctor(id, updateDoctorSchema.parse(req.body));
  sendSuccess(res, doctor);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  sendSuccess(res, await doctorService.deleteDoctor(id));
});

export const listPatients = asyncHandler(async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const query = doctorPatientsQuerySchema.parse(req.query);
  const result = await patientService.listForDoctor(id, query);
  sendSuccess(res, result.items, result.meta);
});

export const createPatient = asyncHandler(async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const patient = await patientService.createForDoctor(id, createPatientSchema.parse(req.body));
  sendSuccess(res, patient, undefined, 201);
});

export const removePatient = asyncHandler(async (req: Request, res: Response) => {
  const { id, patientId } = doctorPatientParamSchema.parse(req.params);
  sendSuccess(res, await patientService.deletePatient(patientId, id));
});

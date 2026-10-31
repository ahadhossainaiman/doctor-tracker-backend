import { Router } from 'express';
import { validate } from '../../middlewares/validate.js';
import * as dashboardController from './controller.js';
import { conditionsSchema, patientsPerDoctorSchema, timeseriesSchema } from './schema.js';

export const dashboardRouter = Router();

dashboardRouter.get('/summary', dashboardController.summary);
dashboardRouter.get(
  '/patients-per-doctor',
  validate(patientsPerDoctorSchema, 'query'),
  dashboardController.patientsPerDoctor,
);
dashboardRouter.get(
  '/timeseries',
  validate(timeseriesSchema, 'query'),
  dashboardController.timeseries,
);
dashboardRouter.get(
  '/conditions',
  validate(conditionsSchema, 'query'),
  dashboardController.conditions,
);
dashboardRouter.get('/specializations', dashboardController.specializations);

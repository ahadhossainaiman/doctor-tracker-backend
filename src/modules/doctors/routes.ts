import { Router } from 'express';
import { validate } from '../../middlewares/validate.js';
import { doctorPatientParamSchema, idParamSchema } from '../../utils/objectId.js';
import { createPatientSchema } from '../patients/schema.js';
import * as doctorController from './controller.js';
import {
  createDoctorSchema,
  doctorListSchema,
  doctorPatientsQuerySchema,
  updateDoctorSchema,
} from './schema.js';

export const doctorRouter = Router();

doctorRouter.get('/', validate(doctorListSchema, 'query'), doctorController.list);
doctorRouter.post('/', validate(createDoctorSchema), doctorController.create);
doctorRouter.get('/:id', validate(idParamSchema, 'params'), doctorController.detail);
doctorRouter.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateDoctorSchema),
  doctorController.update,
);
doctorRouter.delete('/:id', validate(idParamSchema, 'params'), doctorController.remove);
doctorRouter.get(
  '/:id/patients',
  validate(idParamSchema, 'params'),
  validate(doctorPatientsQuerySchema, 'query'),
  doctorController.listPatients,
);
doctorRouter.post(
  '/:id/patients',
  validate(idParamSchema, 'params'),
  validate(createPatientSchema),
  doctorController.createPatient,
);
doctorRouter.delete(
  '/:id/patients/:patientId',
  validate(doctorPatientParamSchema, 'params'),
  doctorController.removePatient,
);

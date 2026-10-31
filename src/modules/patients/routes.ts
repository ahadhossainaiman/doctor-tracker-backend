import { Router } from 'express';
import { validate } from '../../middlewares/validate.js';
import { idParamSchema } from '../../utils/objectId.js';
import * as patientController from './controller.js';
import { patientListSchema, updatePatientSchema } from './schema.js';

export const patientRouter = Router();

patientRouter.get('/', validate(patientListSchema, 'query'), patientController.list);
patientRouter.get('/:id', validate(idParamSchema, 'params'), patientController.detail);
patientRouter.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updatePatientSchema),
  patientController.update,
);
patientRouter.delete('/:id', validate(idParamSchema, 'params'), patientController.remove);

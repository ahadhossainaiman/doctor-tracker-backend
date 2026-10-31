import { Router } from 'express';
import * as metaController from './controller.js';

export const metaRouter = Router();

metaRouter.get('/filters', metaController.filters);

import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import mongoSanitize from 'express-mongo-sanitize';
import helmet from 'helmet';
import { corsOptions } from './config/cors.js';
import { authenticate, authorize } from './middlewares/authenticate.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { notFound } from './middlewares/notFound.js';
import { requestId } from './middlewares/requestId.js';
import { authRouter } from './modules/auth/routes.js';
import { dashboardRouter } from './modules/dashboard/routes.js';
import { doctorRouter } from './modules/doctors/routes.js';
import { metaRouter } from './modules/meta/routes.js';
import { patientRouter } from './modules/patients/routes.js';
import { sendSuccess } from './utils/response.js';

export function createApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(requestId);
  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(cookieParser());
  app.use(express.json({ limit: '100kb' }));
  // express-mongo-sanitize assigns req.query; Express 5 makes that property read-only.
  app.use(mongoSanitize());

  app.get('/api/v1/health', (_req, res) => {
    sendSuccess(res, { status: 'ok' });
  });

  const requireAdmin = [authenticate, authorize('admin')];

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/doctors', requireAdmin, doctorRouter);
  app.use('/api/v1/patients', requireAdmin, patientRouter);
  app.use('/api/v1/dashboard', requireAdmin, dashboardRouter);
  app.use('/api/v1/meta', requireAdmin, metaRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

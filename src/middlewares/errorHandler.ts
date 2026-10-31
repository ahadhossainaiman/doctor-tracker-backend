import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { sendError } from '../utils/response.js';

type DuplicateKeyError = {
  code: number;
  keyPattern?: Record<string, unknown>;
};

function isDuplicateKey(err: unknown): err is DuplicateKeyError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 11000
  );
}

function isJsonParseError(err: unknown): err is SyntaxError & { status: number } {
  return err instanceof SyntaxError && 'status' in err && err.status === 400;
}

function logError(req: Request, err: unknown, statusCode: number): void {
  const message = err instanceof Error ? err.message : 'Unknown error';
  console.error(
    JSON.stringify({
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      statusCode,
      message,
    }),
  );

  if (statusCode >= 500 && env.NODE_ENV !== 'production' && err instanceof Error && err.stack) {
    console.error(err.stack);
  }
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    logError(req, err, err.statusCode);
    sendError(res, err.statusCode, err.code, err.message, err.details);
    return;
  }

  if (err instanceof ZodError) {
    logError(req, err, 422);
    sendError(res, 422, 'VALIDATION_ERROR', 'Validation failed', err.flatten());
    return;
  }

  if (isJsonParseError(err)) {
    logError(req, err, 400);
    sendError(res, 400, 'BAD_REQUEST', 'Request body must be valid JSON');
    return;
  }

  if (err instanceof mongoose.Error.CastError) {
    logError(req, err, 400);
    sendError(res, 400, 'BAD_REQUEST', 'Invalid identifier');
    return;
  }

  if (err instanceof mongoose.Error.ValidationError) {
    logError(req, err, 400);
    sendError(res, 400, 'BAD_REQUEST', 'Validation failed', err.errors);
    return;
  }

  if (isDuplicateKey(err)) {
    logError(req, err, 409);
    const fields = Object.keys(err.keyPattern ?? {});
    sendError(res, 409, 'CONFLICT', 'A record with this value already exists', { fields });
    return;
  }

  logError(req, err, 500);
  sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
}

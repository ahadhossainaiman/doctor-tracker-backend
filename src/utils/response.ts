import type { Response } from 'express';

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export function toPaginationMeta(page: number, limit: number, total: number): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
  };
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  meta?: PaginationMeta,
  statusCode = 200,
): void {
  if (meta) {
    res.status(statusCode).json({ success: true, data, meta });
    return;
  }

  res.status(statusCode).json({ success: true, data });
}

export function sendError(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
): void {
  const error = details === undefined ? { code, message } : { code, message, details };
  res.status(statusCode).json({ success: false, error });
}

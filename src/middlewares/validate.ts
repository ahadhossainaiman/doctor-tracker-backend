import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

type RequestPart = 'body' | 'query' | 'params';

export function validate<T>(schema: ZodType<T>, part: RequestPart = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      next(result.error);
      return;
    }

    // Replace the property so Express 5's read-only query getter still accepts validated data.
    Object.defineProperty(req, part, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: result.data,
    });
    next();
  };
}

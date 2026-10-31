import { z } from 'zod';

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export type Pagination = {
  page: number;
  limit: number;
  skip: number;
};

function blankToUndefined(value: unknown): unknown {
  if (value === undefined || value === '') {
    return undefined;
  }
  return value;
}

/** Offset pagination. Default page size is 10 and the cap is 50. */
export function parsePagination(query: { page?: unknown; limit?: unknown }): Pagination {
  const parsed = paginationSchema.parse({
    page: blankToUndefined(query.page),
    limit: blankToUndefined(query.limit),
  });

  return {
    page: parsed.page,
    limit: parsed.limit,
    skip: (parsed.page - 1) * parsed.limit,
  };
}

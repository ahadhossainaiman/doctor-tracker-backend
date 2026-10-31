import { z } from 'zod';

const limitParam = (fallback: number, max: number) =>
  z.preprocess(
    (value) => (value === undefined || value === '' ? undefined : value),
    z.coerce.number().int().min(1).max(max).default(fallback),
  );

export const patientsPerDoctorSchema = z.object({
  limit: limitParam(10, 50),
});

export const timeseriesSchema = z.object({
  range: z.enum(['7d', '30d', '90d', '12m']).default('30d'),
  interval: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.enum(['day', 'week', 'month']).optional(),
  ),
});

export const conditionsSchema = z.object({
  limit: limitParam(6, 20),
});

export type PatientsPerDoctorQuery = z.infer<typeof patientsPerDoctorSchema>;
export type TimeseriesQuery = z.infer<typeof timeseriesSchema>;
export type ConditionsQuery = z.infer<typeof conditionsSchema>;

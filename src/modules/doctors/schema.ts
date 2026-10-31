import { z } from 'zod';

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().max(max).optional(),
  );

const dateInput = z.string().refine((value) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return true;
  }
  return !Number.isNaN(Date.parse(value));
}, 'Invalid date');

const optionalDate = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  dateInput.optional(),
);

export const createDoctorSchema = z.object({
  name: z.string().trim().min(1).max(120),
  specialization: z.string().trim().min(1).max(120),
  hospital: z.string().trim().min(1).max(160),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+()\-\s]{7,20}$/, 'Invalid phone'),
  email: z.email().transform((value) => value.toLowerCase()),
});

export const updateDoctorSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    specialization: z.string().trim().min(1).max(120),
    hospital: z.string().trim().min(1).max(160),
    phone: z
      .string()
      .trim()
      .regex(/^[0-9+()\-\s]{7,20}$/, 'Invalid phone'),
    email: z.email().transform((value) => value.toLowerCase()),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const doctorListSchema = z.object({
  q: optionalText(80),
  specialization: optionalText(120),
  hospital: optionalText(160),
  from: optionalDate,
  to: optionalDate,
  sort: z.enum(['name', 'createdAt', 'patientCount']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.preprocess(
    (value) => (value === undefined || value === '' ? undefined : value),
    z.coerce.number().int().min(1).default(1),
  ),
  limit: z.preprocess(
    (value) => (value === undefined || value === '' ? undefined : value),
    z.coerce.number().int().min(1).max(50).default(10),
  ),
});

export const doctorPatientsQuerySchema = z.object({
  q: optionalText(80),
  page: z.preprocess(
    (value) => (value === undefined || value === '' ? undefined : value),
    z.coerce.number().int().min(1).default(1),
  ),
  limit: z.preprocess(
    (value) => (value === undefined || value === '' ? undefined : value),
    z.coerce.number().int().min(1).max(50).default(10),
  ),
});

export type CreateDoctorInput = z.infer<typeof createDoctorSchema>;
export type UpdateDoctorInput = z.infer<typeof updateDoctorSchema>;
export type DoctorListQuery = z.infer<typeof doctorListSchema>;
export type DoctorPatientsQuery = z.infer<typeof doctorPatientsQuerySchema>;

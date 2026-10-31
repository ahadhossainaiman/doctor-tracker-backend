import { z } from 'zod';
import { objectIdSchema } from '../../utils/objectId.js';

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().max(max).optional(),
  );

const dateInput = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date');

const optionalDate = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  dateInput.optional(),
);

const optionalEmail = z.preprocess(
  (value) => (value === null ? '' : value),
  z.union([z.literal(''), z.email().transform((value) => value.toLowerCase())]).optional(),
);

const patientShape = {
  name: z.string().trim().min(1).max(120),
  age: z.number().int().min(0).max(130),
  gender: z.enum(['male', 'female', 'other']),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+()\-\s]{7,20}$/, 'Invalid phone'),
  email: optionalEmail,
  condition: z.string().trim().min(1).max(120),
  registeredAt: dateInput.optional(),
  notes: z.string().trim().max(2000).optional(),
};

export const createPatientSchema = z.object(patientShape);

export const updatePatientSchema = z
  .object({
    ...patientShape,
    doctor: objectIdSchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const patientListSchema = z.object({
  q: optionalText(80),
  condition: optionalText(120),
  doctor: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    objectIdSchema.optional(),
  ),
  gender: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.enum(['male', 'female', 'other']).optional(),
  ),
  from: optionalDate,
  to: optionalDate,
  sort: z.enum(['name', 'registeredAt', 'age', 'createdAt']).default('registeredAt'),
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

export type CreatePatientInput = z.infer<typeof createPatientSchema>;
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;
export type PatientListQuery = z.infer<typeof patientListSchema>;

import { Types } from 'mongoose';
import { z } from 'zod';

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const idParamSchema = z.object({
  id: objectIdSchema,
});

export const doctorPatientParamSchema = z.object({
  id: objectIdSchema,
  patientId: objectIdSchema,
});

export function isObjectId(value: string): boolean {
  return Types.ObjectId.isValid(value);
}

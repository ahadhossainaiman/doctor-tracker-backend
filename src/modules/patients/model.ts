import { Schema, model, type Types } from 'mongoose';

export type PatientGender = 'male' | 'female' | 'other';

export interface PatientDocument {
  name: string;
  age: number;
  gender: PatientGender;
  phone: string;
  email?: string;
  condition: string;
  registeredAt: Date;
  notes?: string;
  doctor: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const patientSchema = new Schema<PatientDocument>(
  {
    name: { type: String, required: true, trim: true },
    age: { type: Number, required: true, min: 0, max: 130 },
    gender: { type: String, required: true, enum: ['male', 'female', 'other'] },
    phone: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    condition: { type: String, required: true, trim: true },
    registeredAt: { type: Date, required: true },
    notes: { type: String, trim: true },
    doctor: { type: Schema.Types.ObjectId, ref: 'Doctor', required: true },
  },
  { timestamps: true },
);

patientSchema.index({ doctor: 1, registeredAt: -1 });
patientSchema.index({ condition: 1, registeredAt: -1 });
patientSchema.index({ registeredAt: -1 });
patientSchema.index({ name: 'text', condition: 'text' });
// PAT-3 phone search and PAT-4 gender filter are not covered by the SRS text index.
patientSchema.index({ phone: 1 });
patientSchema.index({ name: 1 });
patientSchema.index({ gender: 1, registeredAt: -1 });

export const Patient = model<PatientDocument>('Patient', patientSchema);

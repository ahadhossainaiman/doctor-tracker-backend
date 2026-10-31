import { Schema, model } from 'mongoose';

export interface DoctorDocument {
  name: string;
  specialization: string;
  hospital: string;
  phone: string;
  email: string;
  patientCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const doctorSchema = new Schema<DoctorDocument>(
  {
    name: { type: String, required: true, trim: true },
    specialization: { type: String, required: true, trim: true },
    hospital: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    patientCount: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

doctorSchema.index({ email: 1 }, { unique: true });
doctorSchema.index({ createdAt: -1 });
doctorSchema.index({ specialization: 1, createdAt: -1 });
doctorSchema.index({ hospital: 1, createdAt: -1 });
doctorSchema.index({ patientCount: -1 });
doctorSchema.index({ name: 'text', specialization: 'text', hospital: 'text' });
// DOC-5 sorts by name. The text index cannot serve that sort.
doctorSchema.index({ name: 1 });

export const Doctor = model<DoctorDocument>('Doctor', doctorSchema);

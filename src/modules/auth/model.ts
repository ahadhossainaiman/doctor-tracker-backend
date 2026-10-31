import { Schema, model } from 'mongoose';

export interface UserDocument {
  name: string;
  email: string;
  passwordHash: string;
  role: 'admin';
  tokenVersion: number;
  refreshTokenHash?: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDocument>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, required: true, enum: ['admin'], default: 'admin' },
    tokenVersion: { type: Number, required: true, default: 0 },
    refreshTokenHash: { type: String },
  },
  { timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true });

export const User = model<UserDocument>('User', userSchema);

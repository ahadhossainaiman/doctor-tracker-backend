import bcrypt from 'bcrypt';
import { faker } from '@faker-js/faker';
import { Types } from 'mongoose';
import { z } from 'zod';
import { connectDb, disconnectDb } from '../config/db.js';
import { BCRYPT_COST } from '../modules/auth/service.js';
import { User } from '../modules/auth/model.js';
import { Doctor } from '../modules/doctors/model.js';
import { Patient } from '../modules/patients/model.js';
import { recountPatientCounts } from '../modules/patients/service.js';
import { CONDITIONS, HOSPITALS, SPECIALIZATIONS } from './catalog.js';

const DOCTOR_COUNT = 200;
const PATIENT_COUNT = 5000;

const seedAdminSchema = z.object({
  SEED_ADMIN_NAME: z.string().trim().min(1).default('Admin'),
  SEED_ADMIN_EMAIL: z.email().transform((value) => value.toLowerCase()),
  SEED_ADMIN_PASSWORD: z.string().min(8),
});

faker.seed(42);

function yearsAgo(days: number): number {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

async function seedAdmin(): Promise<void> {
  const parsed = seedAdminSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD before seeding');
  }

  const passwordHash = await bcrypt.hash(parsed.data.SEED_ADMIN_PASSWORD, BCRYPT_COST);
  await User.updateOne(
    { email: parsed.data.SEED_ADMIN_EMAIL },
    {
      $set: {
        name: parsed.data.SEED_ADMIN_NAME,
        email: parsed.data.SEED_ADMIN_EMAIL,
        passwordHash,
        role: 'admin',
      },
      $setOnInsert: { tokenVersion: 0 },
    },
    { upsert: true },
  );
  console.log(`Admin ready: ${parsed.data.SEED_ADMIN_EMAIL}`);
}

async function seedClinicalData(): Promise<void> {
  if ((await Doctor.countDocuments().exec()) > 0) {
    console.log('Doctors already exist; skipped fake clinical data.');
    return;
  }

  const start = yearsAgo(365);
  const now = Date.now();
  const doctorIds = Array.from({ length: DOCTOR_COUNT }, () => new Types.ObjectId());
  const patientCounts = Array.from({ length: DOCTOR_COUNT }, () => 0);
  const genders = ['male', 'female', 'other'] as const;
  const patients: Record<string, unknown>[] = [];

  for (let index = 0; index < PATIENT_COUNT; index += 1) {
    const doctorIndex = Math.min(DOCTOR_COUNT - 1, Math.floor(Math.random() ** 2 * DOCTOR_COUNT));
    patientCounts[doctorIndex] = (patientCounts[doctorIndex] ?? 0) + 1;
    const registeredAt = new Date(start + Math.random() * (now - start));
    const conditionIndex = Math.min(
      CONDITIONS.length - 1,
      Math.floor(Math.random() ** 2 * CONDITIONS.length),
    );
    patients.push({
      _id: new Types.ObjectId(),
      name: faker.person.fullName(),
      age: faker.number.int({ min: 1, max: 90 }),
      gender: genders[index % genders.length],
      phone: `017${String(index).padStart(8, '0')}`,
      ...(index % 2 === 0 ? { email: `patient${index}@example.com` } : {}),
      condition: CONDITIONS[conditionIndex],
      registeredAt,
      ...(index % 5 === 0 ? { notes: faker.lorem.sentence() } : {}),
      doctor: doctorIds[doctorIndex],
      createdAt: registeredAt,
      updatedAt: registeredAt,
    });
  }

  const doctors = doctorIds.map((id, index) => {
    const createdAt = new Date(start + Math.random() * (now - start));
    return {
      _id: id,
      name: faker.person.fullName(),
      specialization: SPECIALIZATIONS[index % SPECIALIZATIONS.length],
      hospital: HOSPITALS[index % HOSPITALS.length],
      phone: `018${String(index).padStart(8, '0')}`,
      email: `doctor${index}@example.com`,
      patientCount: patientCounts[index] ?? 0,
      createdAt,
      updatedAt: createdAt,
    };
  });

  await Doctor.collection.insertMany(doctors);
  for (let offset = 0; offset < patients.length; offset += 1000) {
    await Patient.collection.insertMany(patients.slice(offset, offset + 1000));
  }

  const recounted = await recountPatientCounts();
  console.log(`Inserted ${DOCTOR_COUNT} doctors and ${PATIENT_COUNT} patients.`);
  console.log(`Rebuilt patientCount for ${recounted.doctors} doctors.`);
}

try {
  await connectDb();
  await seedAdmin();
  await seedClinicalData();
  await disconnectDb();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

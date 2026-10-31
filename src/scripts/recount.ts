import { connectDb, disconnectDb } from '../config/db.js';
import { recountPatientCounts } from '../modules/patients/service.js';

try {
  await connectDb();
  const result = await recountPatientCounts();
  console.log(`Rebuilt patientCount for ${result.doctors} doctors.`);
  await disconnectDb();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

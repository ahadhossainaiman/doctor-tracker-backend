import { connectDb, disconnectDb } from '../config/db.js';

try {
  await connectDb();
  console.log('Seed scaffold ready; no documents written.');
  await disconnectDb();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

import type { Server } from 'node:http';
import mongoose from 'mongoose';
import { env } from './env.js';

const MAX_ATTEMPTS = 5;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function connectDb(): Promise<void> {
  mongoose.set('strictQuery', true);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 5_000 });
      console.log('MongoDB connected');
      return;
    } catch (error) {
      await mongoose.disconnect().catch(() => undefined);
      const message = error instanceof Error ? error.message : 'Unknown connection error';
      console.error(`MongoDB connection attempt ${attempt} of ${MAX_ATTEMPTS} failed: ${message}`);
      if (attempt === MAX_ATTEMPTS) {
        throw error;
      }
      await delay(attempt * 1_000);
    }
  }
}

export async function disconnectDb(): Promise<void> {
  if (mongoose.connection.readyState === 0) {
    return;
  }
  await mongoose.disconnect();
}

export function setupGracefulShutdown(server: Server): void {
  let shuttingDown = false;

  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log(`${signal} received, closing server`);

    const forceExit = setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    server.close((closeError) => {
      void disconnectDb()
        .then(() => {
          process.exit(closeError ? 1 : 0);
        })
        .catch((error: unknown) => {
          console.error(error instanceof Error ? error.message : error);
          process.exit(1);
        });
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

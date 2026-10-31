import { createApp } from './app.js';
import { connectDb, setupGracefulShutdown } from './config/db.js';
import { env } from './config/env.js';

async function main(): Promise<void> {
  await connectDb();

  const server = createApp().listen(env.PORT, () => {
    console.log(`API listening on port ${env.PORT}`);
  });

  server.on('error', (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });

  setupGracefulShutdown(server);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

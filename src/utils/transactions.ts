import mongoose, { type ClientSession } from 'mongoose';

let transactionsAvailable: boolean | undefined;

/** Standalone MongoDB cannot run multi-document transactions. */
export async function supportsTransactions(): Promise<boolean> {
  if (transactionsAvailable !== undefined) {
    return transactionsAvailable;
  }

  const admin = mongoose.connection.db?.admin();
  if (!admin) {
    transactionsAvailable = false;
    return false;
  }

  try {
    const hello = await admin.command({ hello: 1 });
    const setName = hello['setName'];
    transactionsAvailable = typeof setName === 'string' && setName.length > 0;
  } catch {
    transactionsAvailable = false;
  }

  return transactionsAvailable;
}

/**
 * Runs the write in a transaction on a replica set.
 * On a standalone node the same writes run sequentially; scripts/recount.ts repairs drift.
 */
export async function runWithTransaction<T>(
  work: (session: ClientSession | null) => Promise<T>,
): Promise<T> {
  if (!(await supportsTransactions())) {
    return work(null);
  }

  const session = await mongoose.startSession();
  try {
    let value: T | undefined;
    let ran = false;
    await session.withTransaction(async () => {
      value = await work(session);
      ran = true;
    });
    if (!ran) {
      throw new Error('Transaction completed without a result');
    }
    return value as T;
  } finally {
    await session.endSession();
  }
}

export function sessionOptions(
  session: ClientSession | null,
): { session: ClientSession } | undefined {
  return session ? { session } : undefined;
}

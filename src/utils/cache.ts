type CacheEntry = {
  expiresAt: number;
  value: unknown;
};

const store = new Map<string, CacheEntry>();

const DEFAULT_TTL_MS = 60_000;

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) {
    return undefined;
  }
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs = DEFAULT_TTL_MS): void {
  store.set(key, { expiresAt: Date.now() + ttlMs, value });
}

/** Drops dashboard and meta responses after a doctor or patient write. */
export function invalidateReadCaches(): void {
  for (const key of store.keys()) {
    if (key.startsWith('dashboard:') || key.startsWith('meta:')) {
      store.delete(key);
    }
  }
}

// The other host adapter. Modules cache through this, never through a host API (Vercel Data
// Cache, Workers KV, Redis); a host-backed implementation plugs in here when one is needed.
export type Cache = {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
};

export function memoryCache(now: () => number = Date.now): Cache {
  const entries = new Map<string, { value: unknown; expires: number }>();
  return {
    async get<T>(key: string) {
      const e = entries.get(key);
      if (!e) return undefined;
      if (e.expires <= now()) {
        entries.delete(key);
        return undefined;
      }
      return e.value as T;
    },
    async set(key, value, ttlSeconds = 300) {
      entries.set(key, { value, expires: now() + ttlSeconds * 1000 });
    },
    async delete(key) {
      entries.delete(key);
    },
  };
}

export interface CachedResponse {
  etag: string;
  body: unknown;
}

/**
 * Where the client keeps responses to revalidate with `If-None-Match`. Keyed by the request's URL:
 * the ETag names the project, so a response kept for another project's token never matches and is
 * simply refetched. Methods may return a promise, for AsyncStorage or a disk.
 */
export interface CacheAdapter {
  get(key: string): CachedResponse | undefined | Promise<CachedResponse | undefined>;
  set(key: string, value: CachedResponse): void | Promise<void>;
}

/** The default: a map that keeps the most recent `maxEntries` responses. */
export const memoryCache = ({ maxEntries = 500 }: { maxEntries?: number } = {}): CacheAdapter => {
  const entries = new Map<string, CachedResponse>();
  return {
    get: (key) => {
      const value = entries.get(key);
      if (value !== undefined) {
        // Re-inserted, so the map's order is least recently used first.
        entries.delete(key);
        entries.set(key, value);
      }
      return value;
    },
    set: (key, value) => {
      entries.delete(key);
      entries.set(key, value);
      for (const oldest of entries.keys()) {
        if (entries.size <= maxEntries) {
          break;
        }
        entries.delete(oldest);
      }
    },
  };
};

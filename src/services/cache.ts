/**
 * Session-level Cache for GitHub API Requests
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const STORAGE_PREFIX = 'repohealth_cache_';

export class SessionCache {
  private memoryCache: Map<string, CacheEntry<unknown>> = new Map();

  public get<T>(key: string): T | null {
    // Try memory cache first
    const mem = this.memoryCache.get(key);
    if (mem && Date.now() - mem.timestamp < CACHE_TTL_MS) {
      return mem.data as T;
    }

    // Try sessionStorage
    try {
      const raw = sessionStorage.getItem(`${STORAGE_PREFIX}${key}`);
      if (raw) {
        const parsed: CacheEntry<T> = JSON.parse(raw);
        if (Date.now() - parsed.timestamp < CACHE_TTL_MS) {
          this.memoryCache.set(key, parsed);
          return parsed.data;
        } else {
          sessionStorage.removeItem(`${STORAGE_PREFIX}${key}`);
        }
      }
    } catch {
      // sessionStorage may fail in private windows or quota
    }

    return null;
  }

  public set<T>(key: string, data: T): void {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
    };
    this.memoryCache.set(key, entry);

    try {
      sessionStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(entry));
    } catch {
      // Ignore quota exceeded errors
    }
  }

  public delete(key: string): void {
    this.memoryCache.delete(key);
    try {
      sessionStorage.removeItem(`${STORAGE_PREFIX}${key}`);
    } catch {
      // Ignore
    }
  }

  public clear(): void {
    this.memoryCache.clear();
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith(STORAGE_PREFIX)) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => sessionStorage.removeItem(k));
    } catch {
      // Ignore
    }
  }
}

export const sessionCache = new SessionCache();

import type { CacheEntry, CacheOptions } from '../types/permissions.js';

export class CacheService {
  private cache = new Map<string, CacheEntry>();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly defaultTtl: number;

  constructor(defaultTtl: number = 3600000) { // 1 hour default
    this.defaultTtl = defaultTtl;
    this.startCleanupTimer();
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  set<T>(key: string, value: T, options?: CacheOptions): void {
    const ttl = options?.ttl ?? this.defaultTtl;
    const expiresAt = Date.now() + ttl;

    this.cache.set(key, {
      value,
      expiresAt
    });
  }

  clear(): void {
    this.cache.clear();
  }

  clearUser(userId: string): void {
    const keysToDelete: string[] = [];
    
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${userId}-`) || key === userId) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));
  }

  generatePermissionKey(userId: string, siteId: string, resource: string, action: string): string {
    return `${userId}-${siteId}-${resource}-${action}`;
  }

  generateUserRoleKey(userId: string, siteId: string): string {
    return `${userId}-${siteId}-role`;
  }

  generateBulkPermissionKey(userId: string, siteId: string, checkHash: string): string {
    return `${userId}-${siteId}-bulk-${checkHash}`;
  }

  private startCleanupTimer(): void {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredEntries();
    }, 300000);
  }

  private cleanupExpiredEntries(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }

  size(): number {
    return this.cache.size;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }
}

